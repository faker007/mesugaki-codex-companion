import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import test from 'node:test';

import {
  createQueueProcessor,
  deriveSessionQueueKey,
  enqueueResponse,
  getQueueStatus,
  socketPathForSession,
  startQueueServer,
} from './response-queue.mjs';

test('session queue key is stable and never exposes the raw thread id', () => {
  const env = { CODEX_THREAD_ID: 'private-thread-id' };
  const first = deriveSessionQueueKey(env);
  const second = deriveSessionQueueKey(env);
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{24}$/);
  assert.equal(first.includes(env.CODEX_THREAD_ID), false);
  assert.equal(socketPathForSession(first).includes(env.CODEX_THREAD_ID), false);
});

test('session queue key requires a Codex thread id', () => {
  assert.throws(() => deriveSessionQueueKey({}), { code: 'SESSION_ID_REQUIRED' });
});

test('global queue key is identical across Codex threads', () => {
  const first = deriveSessionQueueKey({ CODEX_THREAD_ID: 'thread-a' }, 'global');
  const second = deriveSessionQueueKey({ CODEX_THREAD_ID: 'thread-b' }, 'global');
  const withoutThread = deriveSessionQueueKey({}, 'global');
  assert.equal(first, second);
  assert.equal(first, withoutThread);
  assert.notEqual(
    deriveSessionQueueKey({ CODEX_THREAD_ID: 'thread-a' }, 'thread'),
    deriveSessionQueueKey({ CODEX_THREAD_ID: 'thread-b' }, 'thread'),
  );
  assert.throws(
    () => deriveSessionQueueKey({}, 'machine'),
    { code: 'INVALID_SHARE_SCOPE' },
  );
});

test('queue processor executes jobs sequentially', async () => {
  const events = [];
  let releaseFirst;
  const firstGate = new Promise((resolvePromise) => { releaseFirst = resolvePromise; });
  const processor = createQueueProcessor({
    maxPendingJobs: 4,
    runJob: async ({ id }) => {
      events.push(`start:${id}`);
      if (id === 1) await firstGate;
      events.push(`end:${id}`);
    },
  });
  processor.enqueue({ id: 1 });
  processor.enqueue({ id: 2 });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.deepEqual(events, ['start:1']);
  releaseFirst();
  const status = await processor.waitForIdle();
  assert.deepEqual(events, ['start:1', 'end:1', 'start:2', 'end:2']);
  assert.equal(status.completedJobs, 2);
  assert.equal(status.failedJobs, 0);
});

test('queue processor exposes redacted per-job synthesis and playback progress', async () => {
  let releaseJob;
  const gate = new Promise((resolvePromise) => { releaseJob = resolvePromise; });
  const processor = createQueueProcessor({
    runJob: async (_job, onProgress) => {
      onProgress({
        state: 'playing-and-synthesizing',
        totalSegments: 3,
        synthesizedSegments: 2,
        readySegments: 1,
        completedSegments: 0,
        synthesizingSegment: 2,
        playingSegment: 1,
        sourceText: 'must never escape',
      });
      await gate;
    },
  });
  const receipt = processor.enqueue({ jobId: 'job-token-1', responseArgs: ['secret'] });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  const active = processor.status(receipt.jobToken);
  assert.equal(active.job.state, 'playing-and-synthesizing');
  assert.equal(active.job.readySegments, 1);
  assert.equal(active.job.playingSegment, 1);
  assert.equal(JSON.stringify(active).includes('must never escape'), false);
  assert.equal(JSON.stringify(active).includes('secret'), false);
  releaseJob();
  await processor.waitForIdle();
  const completed = processor.status(receipt.jobToken);
  assert.equal(completed.job.state, 'completed');
});

test('queue processor treats repeated job tokens as idempotent enqueue retries', async () => {
  let calls = 0;
  let releaseJob;
  const gate = new Promise((resolvePromise) => { releaseJob = resolvePromise; });
  const processor = createQueueProcessor({
    runJob: async () => {
      calls += 1;
      await gate;
    },
  });
  const job = { jobId: 'retry-token', responseArgs: ['one'] };
  const first = processor.enqueue(job);
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  const retry = processor.enqueue({ jobId: 'retry-token', responseArgs: ['different'] });
  assert.equal(first.duplicate, false);
  assert.equal(retry.duplicate, true);
  assert.equal(retry.job.state, 'preflight');
  releaseJob();
  await processor.waitForIdle();
  const afterCompletion = processor.enqueue({ jobId: 'retry-token', responseArgs: ['again'] });
  assert.equal(afterCompletion.duplicate, true);
  assert.equal(afterCompletion.job.state, 'completed');
  assert.equal(calls, 1);
});

test('queue processor halts and drops pending jobs after the first failure', async () => {
  const calls = [];
  const processor = createQueueProcessor({
    maxPendingJobs: 4,
    runJob: async ({ id }) => {
      calls.push(id);
      if (id === 1) throw Object.assign(new Error('provider secret body'), { code: 'TEST_FAILURE' });
    },
  });
  processor.enqueue({ id: 1 });
  processor.enqueue({ id: 2 });
  const status = await processor.waitForIdle();
  assert.deepEqual(calls, [1]);
  assert.equal(status.status, 'halted');
  assert.equal(status.failedJobs, 1);
  assert.equal(status.droppedJobs, 1);
  assert.equal(JSON.stringify(status).includes('provider secret body'), false);
  assert.throws(() => processor.enqueue({ id: 3 }), { code: 'QUEUE_HALTED' });
});

test('socket server shares one in-memory queue for a Codex session', async () => {
  const env = { CODEX_THREAD_ID: `queue-test-${randomUUID()}` };
  const sessionKey = deriveSessionQueueKey(env);
  const socketPath = socketPathForSession(sessionKey);
  await unlink(socketPath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
  const jobs = [];
  const controller = await startQueueServer({
    socketPath,
    idleTimeoutMs: 60_000,
    maxPendingJobs: 4,
    runJob: async (job) => { jobs.push(job.responseArgs); },
  });
  try {
    const first = await enqueueResponse({
      env,
      responseArgs: ['--dry-run', '--text-base64=7ZWY64KY'],
    });
    const second = await enqueueResponse({
      env,
      responseArgs: ['--dry-run', '--text-base64=65GQ'],
    });
    assert.equal(first.sessionKey, sessionKey);
    assert.equal(second.sessionKey, sessionKey);
    assert.equal(first.queueStatus, 'enqueued');
    await controller.processor.waitForIdle();
    const status = await getQueueStatus({ env });
    assert.equal(status.completedJobs, 2);
    assert.equal(status.failedJobs, 0);
    assert.equal(jobs.length, 2);
  } finally {
    await controller.close();
  }
});
