#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { chmod, mkdir, rmdir, unlink } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_VOICE_SPEAK_ROOT = resolve(
  process.env.MESUGAKI_VOICE_SPEAK_ROOT
    ?? join(homedir(), '.agents/skills/voice-speak'),
);
const DEFAULT_RESPONSE_SCRIPT = join(DEFAULT_VOICE_SPEAK_ROOT, 'scripts/speak-response.mjs');
const DEFAULT_IDLE_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_PENDING_JOBS = 4;
const MAX_MESSAGE_BYTES = 2_097_152;
const WORKER_START_TIMEOUT_MS = 2_000;
const MAX_RECENT_JOB_STATUSES = 16;

export class ResponseQueueError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ResponseQueueError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ResponseQueueError(code, message, details);
}

function parsePositiveInteger(value, label, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    fail('INVALID_NUMBER', `${label} must be an integer from ${min} to ${max}`);
  }
  return parsed;
}

function normalizeShareScope(value = 'thread') {
  const scope = String(value).trim().toLowerCase();
  if (scope === 'thread' || scope === 'global') return scope;
  fail('INVALID_SHARE_SCOPE', 'queue share scope must be thread or global');
}

export function deriveSessionQueueKey(env = process.env, shareScope = 'thread') {
  const scope = normalizeShareScope(shareScope);
  if (scope === 'global') {
    return createHash('sha256')
      .update('codex-runa-voice:global:v1')
      .digest('hex')
      .slice(0, 24);
  }
  const threadId = env.CODEX_THREAD_ID?.trim();
  if (!threadId) {
    fail('SESSION_ID_REQUIRED', 'CODEX_THREAD_ID is required for session-shared response audio');
  }
  return createHash('sha256')
    .update(`codex-thread:${threadId}`)
    .digest('hex')
    .slice(0, 24);
}

export function socketPathForSession(sessionKey, uid = process.getuid?.() ?? 'user') {
  if (!/^[a-f0-9]{24}$/.test(sessionKey)) {
    fail('INVALID_SESSION_KEY', 'session queue key must be a 24-character lowercase hex digest');
  }
  return `/tmp/codex-runa-voice-${uid}-${sessionKey}.sock`;
}

function lockPathForSocket(socketPath) {
  return `${socketPath}.starting`;
}

function publicFailure(error) {
  return {
    code: error?.code ?? 'UNEXPECTED_ERROR',
    message: error?.message ?? 'unexpected error',
  };
}

function sanitizedJobFailure(error) {
  return {
    code: error?.code ?? 'UNEXPECTED_ERROR',
    message: 'queued response voice job failed',
  };
}

function sanitizeProgress(progress = {}) {
  const result = {};
  if (typeof progress.state === 'string') result.state = progress.state;
  for (const key of [
    'totalSegments',
    'synthesizedSegments',
    'readySegments',
    'completedSegments',
    'synthesizingSegment',
    'playingSegment',
  ]) {
    const value = progress[key];
    if (value === null || Number.isSafeInteger(value)) result[key] = value;
  }
  return result;
}

function snapshotJob(job) {
  return {
    jobToken: job.jobId,
    ...sanitizeProgress(job.progress),
  };
}

export function createQueueProcessor({ runJob, maxPendingJobs = DEFAULT_MAX_PENDING_JOBS } = {}) {
  if (typeof runJob !== 'function') fail('RUN_JOB_REQUIRED', 'queue processor requires runJob');
  const pendingLimit = parsePositiveInteger(maxPendingJobs, 'maxPendingJobs', { max: 8 });
  const pending = [];
  const idleWaiters = [];
  let active = null;
  let halted = null;
  let completedJobs = 0;
  let failedJobs = 0;
  let droppedJobs = 0;

  const recent = new Map();

  const remember = (job) => {
    recent.delete(job.jobId);
    recent.set(job.jobId, snapshotJob(job));
    while (recent.size > MAX_RECENT_JOB_STATUSES) {
      recent.delete(recent.keys().next().value);
    }
  };

  const resolveIdle = () => {
    if (active || pending.length) return;
    for (const resolvePromise of idleWaiters.splice(0)) resolvePromise(status());
  };

  const status = (jobToken = null) => ({
    status: halted ? 'halted' : active || pending.length ? 'busy' : 'idle',
    active: Boolean(active),
    pendingJobs: pending.length,
    completedJobs,
    failedJobs,
    droppedJobs,
    ...(active ? { activeJob: snapshotJob(active) } : {}),
    ...(jobToken ? {
      job: active?.jobId === jobToken
        ? snapshotJob(active)
        : pending.find((job) => job.jobId === jobToken)
          ? snapshotJob(pending.find((job) => job.jobId === jobToken))
          : recent.get(jobToken) ?? null,
    } : {}),
    ...(halted ? { lastFailure: halted } : {}),
  });

  const pump = async () => {
    if (active || halted) return;
    const job = pending.shift();
    if (!job) {
      resolveIdle();
      return;
    }
    active = job;
    job.progress = { ...job.progress, state: 'preflight' };
    try {
      await runJob(job, (progress) => {
        job.progress = { ...job.progress, ...sanitizeProgress(progress) };
      });
      completedJobs += 1;
      job.progress = { ...job.progress, state: 'completed' };
      remember(job);
    } catch (error) {
      failedJobs += 1;
      halted = sanitizedJobFailure(error);
      job.progress = { ...job.progress, state: 'failed' };
      remember(job);
      droppedJobs += pending.length;
      for (const dropped of pending) {
        dropped.progress = { ...dropped.progress, state: 'dropped' };
        remember(dropped);
      }
      pending.splice(0);
    } finally {
      active = null;
      if (!halted && pending.length) queueMicrotask(pump);
      else resolveIdle();
    }
  };

  return {
    enqueue(job) {
      const hasJobToken = typeof job.jobId === 'string' && job.jobId.length > 0;
      if (hasJobToken && active?.jobId === job.jobId) {
        return { jobToken: job.jobId, position: 1, duplicate: true, ...status(job.jobId) };
      }
      const pendingIndex = hasJobToken
        ? pending.findIndex((candidate) => candidate.jobId === job.jobId)
        : -1;
      if (pendingIndex !== -1) {
        return {
          jobToken: job.jobId,
          position: Number(Boolean(active)) + pendingIndex + 1,
          duplicate: true,
          ...status(job.jobId),
        };
      }
      if (hasJobToken && recent.has(job.jobId)) {
        return { jobToken: job.jobId, position: 0, duplicate: true, ...status(job.jobId) };
      }
      if (halted) {
        fail('QUEUE_HALTED', 'response queue is halted after a failed job', {
          lastFailure: halted,
        });
      }
      const queuedJobs = Number(Boolean(active)) + pending.length;
      if (queuedJobs >= pendingLimit) {
        fail('QUEUE_FULL', `response queue already has ${queuedJobs} active or pending jobs`, {
          maxPendingJobs: pendingLimit,
        });
      }
      job.progress = { state: 'queued' };
      pending.push(job);
      const position = Number(Boolean(active)) + pending.length;
      queueMicrotask(pump);
      return { jobToken: job.jobId, position, duplicate: false, ...status(job.jobId) };
    },
    status,
    waitForIdle() {
      if (!active && !pending.length) return Promise.resolve(status());
      return new Promise((resolvePromise) => idleWaiters.push(resolvePromise));
    },
  };
}

function parseWorkerArgs(argv) {
  const options = {};
  for (const raw of argv) {
    if (raw === '--worker') {
      options.worker = true;
      continue;
    }
    const equals = raw.indexOf('=');
    if (!raw.startsWith('--') || equals === -1) {
      fail('INVALID_WORKER_ARGUMENT', `invalid worker argument: ${raw}`);
    }
    const name = raw.slice(2, equals);
    const value = raw.slice(equals + 1);
    if (![
      'socket',
      'lock-path',
      'idle-timeout-ms',
      'max-pending-jobs',
      'response-script',
    ].includes(name)) {
      fail('UNKNOWN_WORKER_OPTION', `unknown worker option: --${name}`);
    }
    options[name] = value;
  }
  if (!options.worker || !options.socket) {
    fail('INVALID_WORKER_ARGUMENT', '--worker and --socket are required');
  }
  options.idleTimeoutMs = parsePositiveInteger(
    options['idle-timeout-ms'] ?? DEFAULT_IDLE_TIMEOUT_MS,
    '--idle-timeout-ms',
    { min: 1_000, max: 3_600_000 },
  );
  options.maxPendingJobs = parsePositiveInteger(
    options['max-pending-jobs'] ?? DEFAULT_MAX_PENDING_JOBS,
    '--max-pending-jobs',
    { max: 8 },
  );
  options.responseScript = resolve(options['response-script'] ?? DEFAULT_RESPONSE_SCRIPT);
  options.lockPath = options['lock-path'];
  return options;
}

async function defaultRunJob(responseScript, responseArgs, onProgress) {
  const module = await import(pathToFileURL(resolve(responseScript)).href);
  if (typeof module.runSpeakResponse !== 'function') {
    fail('INVALID_RESPONSE_MODULE', 'response voice module must export runSpeakResponse');
  }
  const result = await module.runSpeakResponse(responseArgs, { onProgress });
  if (!result?.ok) fail('VOICE_JOB_FAILED', 'queued response voice job returned a failure');
  return result;
}

function validateEnqueuePayload(payload) {
  if (payload?.type !== 'enqueue'
    || typeof payload.jobId !== 'string'
    || !Array.isArray(payload.responseArgs)
    || !payload.responseArgs.every((value) => typeof value === 'string')) {
    fail('INVALID_QUEUE_REQUEST', 'enqueue request must contain a job id and response argument list');
  }
}

export async function startQueueServer({
  socketPath,
  responseScript = DEFAULT_RESPONSE_SCRIPT,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  maxPendingJobs = DEFAULT_MAX_PENDING_JOBS,
  runJob = (job, onProgress) => defaultRunJob(responseScript, job.responseArgs, onProgress),
} = {}) {
  if (!socketPath) fail('SOCKET_PATH_REQUIRED', 'queue server requires a socket path');
  const idleTimeout = parsePositiveInteger(idleTimeoutMs, 'idleTimeoutMs', {
    min: 1_000,
    max: 3_600_000,
  });
  const processor = createQueueProcessor({ runJob, maxPendingJobs });
  let idleTimer = null;
  let closing = false;
  let closeResolve;
  const closed = new Promise((resolvePromise) => { closeResolve = resolvePromise; });
  const server = createServer((socket) => {
    socket.setEncoding('utf8');
    let body = '';
    socket.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_MESSAGE_BYTES) {
        socket.end(`${JSON.stringify({ ok: false, code: 'QUEUE_MESSAGE_TOO_LARGE' })}\n`);
        socket.destroy();
        return;
      }
      const newline = body.indexOf('\n');
      if (newline === -1) return;
      let payload;
      try {
        payload = JSON.parse(body.slice(0, newline));
        if (payload.type === 'status') {
          const jobToken = typeof payload.jobToken === 'string' ? payload.jobToken : null;
          socket.end(`${JSON.stringify({ ok: true, ...processor.status(jobToken) })}\n`);
          return;
        }
        validateEnqueuePayload(payload);
        const accepted = processor.enqueue({
          jobId: payload.jobId,
          responseArgs: payload.responseArgs,
        });
        socket.end(`${JSON.stringify({ ok: true, queueStatus: 'enqueued', ...accepted })}\n`);
        void processor.waitForIdle().then((state) => {
          if (state.status === 'halted') return close();
          return undefined;
        }).catch(() => {});
      } catch (error) {
        const failure = publicFailure(error);
        socket.end(`${JSON.stringify({ ok: false, ...failure })}\n`);
      }
    });
  });

  const removeSocket = async () => {
    await unlink(socketPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  };

  const close = async () => {
    if (closing) return await closed;
    closing = true;
    if (idleTimer) clearTimeout(idleTimer);
    await new Promise((resolvePromise) => server.close(resolvePromise));
    await removeSocket();
  };

  const scheduleIdleClose = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(async () => {
      const state = processor.status();
      if (state.active || state.pendingJobs) {
        scheduleIdleClose();
        return;
      }
      await close();
    }, idleTimeout);
    idleTimer.unref?.();
  };

  server.on('connection', scheduleIdleClose);
  server.on('close', () => closeResolve());
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(socketPath, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });
  await chmod(socketPath, 0o600);
  scheduleIdleClose();
  return { processor, server, close, closed };
}

function sendQueueRequest(socketPath, payload, timeoutMs = 1_000) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createConnection(socketPath);
    socket.setEncoding('utf8');
    let body = '';
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      callback(value);
    };
    const timer = setTimeout(() => {
      finish(rejectPromise, Object.assign(new Error('response queue request timed out'), {
        code: 'QUEUE_TIMEOUT',
      }));
    }, timeoutMs);
    socket.on('connect', () => socket.write(`${JSON.stringify(payload)}\n`));
    socket.on('data', (chunk) => { body += chunk; });
    socket.on('end', () => {
      try {
        const result = JSON.parse(body.trim());
        if (!result.ok) {
          finish(rejectPromise, new ResponseQueueError(
            result.code ?? 'QUEUE_REQUEST_FAILED',
            result.message ?? 'response queue request failed',
          ));
          return;
        }
        finish(resolvePromise, result);
      } catch {
        finish(rejectPromise, new ResponseQueueError(
          'INVALID_QUEUE_RESPONSE',
          'response queue returned invalid JSON',
        ));
      }
    });
    socket.on('error', (error) => finish(rejectPromise, error));
  });
}

function recoverableSocketError(error) {
  return ['ENOENT', 'ECONNREFUSED', 'ECONNRESET', 'QUEUE_TIMEOUT'].includes(error?.code);
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function spawnQueueWorker({
  nodePath,
  workerScript,
  socketPath,
  responseScript,
  idleTimeoutMs,
  maxPendingJobs,
  lockPath,
  env,
}) {
  const child = spawn(nodePath, [
    workerScript,
    '--worker',
    `--socket=${socketPath}`,
    `--lock-path=${lockPath}`,
    `--response-script=${responseScript}`,
    `--idle-timeout-ms=${idleTimeoutMs}`,
    `--max-pending-jobs=${maxPendingJobs}`,
  ], {
    detached: true,
    stdio: 'ignore',
    shell: false,
    env,
  });
  child.unref();
}

export async function enqueueResponse({
  env = process.env,
  nodePath = process.execPath,
  workerScript = fileURLToPath(import.meta.url),
  responseScript = DEFAULT_RESPONSE_SCRIPT,
  responseArgs,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  maxPendingJobs = DEFAULT_MAX_PENDING_JOBS,
  shareScope = 'thread',
} = {}) {
  if (!Array.isArray(responseArgs) || !responseArgs.every((value) => typeof value === 'string')) {
    fail('INVALID_RESPONSE_ARGS', 'response queue requires a string argument list');
  }
  const idleTimeout = parsePositiveInteger(idleTimeoutMs, 'idleTimeoutMs', {
    min: 1_000,
    max: 3_600_000,
  });
  const pendingLimit = parsePositiveInteger(maxPendingJobs, 'maxPendingJobs', { max: 8 });
  const normalizedShareScope = normalizeShareScope(shareScope);
  const sessionKey = deriveSessionQueueKey(env, normalizedShareScope);
  const socketPath = socketPathForSession(sessionKey);
  const lockPath = lockPathForSocket(socketPath);
  const payload = {
    type: 'enqueue',
    jobId: randomUUID(),
    responseArgs,
  };
  try {
    const result = await sendQueueRequest(socketPath, payload);
    return { ...result, sessionKey, shareScope: normalizedShareScope };
  } catch (error) {
    if (!recoverableSocketError(error)) throw error;
  }

  let ownsStartLock = false;
  try {
    await mkdir(lockPath, { mode: 0o700 });
    ownsStartLock = true;
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  if (ownsStartLock) {
    await unlink(socketPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    spawnQueueWorker({
      nodePath,
      workerScript,
      socketPath,
      lockPath,
      responseScript: resolve(responseScript),
      idleTimeoutMs: idleTimeout,
      maxPendingJobs: pendingLimit,
      env,
    });
  }

  const deadline = Date.now() + WORKER_START_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await sendQueueRequest(socketPath, payload);
      return { ...result, sessionKey, shareScope: normalizedShareScope };
    } catch (error) {
      lastError = error;
      if (!recoverableSocketError(error)) throw error;
      await delay(25);
    }
  }
  if (ownsStartLock) {
    await rmdir(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  fail('QUEUE_WORKER_START_FAILED', 'response queue worker did not become ready', {
    causeCode: lastError?.code ?? 'UNKNOWN',
  });
}

export async function getQueueStatus({
  env = process.env,
  shareScope = 'thread',
  jobToken = null,
} = {}) {
  const normalizedShareScope = normalizeShareScope(shareScope);
  const sessionKey = deriveSessionQueueKey(env, normalizedShareScope);
  const socketPath = socketPathForSession(sessionKey);
  try {
    const result = await sendQueueRequest(socketPath, { type: 'status', jobToken });
    return { ...result, sessionKey, shareScope: normalizedShareScope };
  } catch (error) {
    if (['ENOENT', 'ECONNREFUSED'].includes(error?.code)) {
      return {
        ok: true,
        status: 'not-running',
        sessionKey,
        shareScope: normalizedShareScope,
      };
    }
    throw error;
  }
}

async function runWorker(argv) {
  const options = parseWorkerArgs(argv);
  const controller = await startQueueServer({
    socketPath: options.socket,
    responseScript: options.responseScript,
    idleTimeoutMs: options.idleTimeoutMs,
    maxPendingJobs: options.maxPendingJobs,
  });
  if (options.lockPath) {
    await rmdir(options.lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
  await controller.closed;
}

function publicError(error) {
  return {
    ok: false,
    code: error?.code ?? 'UNEXPECTED_ERROR',
    message: error?.message ?? 'unexpected error',
    ...(error?.details && Object.keys(error.details).length ? { details: error.details } : {}),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const wantsJson = argv.includes('--json');
  try {
    if (argv.includes('--worker')) {
      await runWorker(argv);
      return;
    }
    if (argv.includes('--status')) {
      const scopeOption = argv.find((value) => value.startsWith('--scope='));
      const jobOption = argv.find((value) => value.startsWith('--job='));
      const shareScope = scopeOption ? scopeOption.slice('--scope='.length) : 'thread';
      const jobToken = jobOption ? jobOption.slice('--job='.length) : null;
      const result = await getQueueStatus({ shareScope, jobToken });
      process.stdout.write(wantsJson
        ? `${JSON.stringify(result, null, 2)}\n`
        : `response queue: ${result.status}, pending=${result.pendingJobs ?? 0}\n`);
      return;
    }
    process.stdout.write(
      'response-queue: use --status --scope=thread|global --json; ' +
      'enqueue through speak-response.mjs --queue\n',
    );
  } catch (error) {
    const result = publicError(error);
    if (wantsJson) process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    else process.stderr.write(`response-queue [${result.code}]: ${result.message}\n`);
    process.exitCode = 1;
  }
}

const isDirectRun = process.argv[1]
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (isDirectRun) await main();
