import type { FeedbackAnalyzed } from '../../src/contexts/analysis/public/feedback-analyzed.js';
import type { InMemoryStore } from '../../src/composition/in-memory-store.js';
import { IN_MEMORY_STORE } from '../../src/composition/tokens.js';
import type { FeedbackId } from '../../src/shared-kernel/ids.js';
import { AuthClient } from './auth-client.js';
import { FakeDevice } from './fake-device.js';
import { FeedbackClient } from './feedback-client.js';
import { startApp, type Customise, type RunningApp } from './start-app.js';

export interface FeedbackApp {
  readonly running: RunningApp;
  readonly auth: AuthClient;
  readonly device: FakeDevice;
  readonly client: FeedbackClient;
  /** Publishes FeedbackAnalyzed the way Analysis will (S0-08): in one unit of work. */
  analyzed(feedbackId: string, verdict: 'valid' | 'spam'): Promise<void>;
  /** Opens a new session for the device; its token replaces the client's. */
  renewSession(): Promise<void>;
}

/**
 * The whole API with the demo catalog (DEMO_DATA=true, NODE_ENV=test) and one registered Android
 * device holding a session. The caller stubs the env before and unstubs it after.
 */
export async function startFeedbackApp(
  customise?: Customise,
): Promise<FeedbackApp> {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('DEMO_DATA', 'true');
  const running = await startApp(customise);
  const auth = new AuthClient(running.app);
  const device = new FakeDevice();
  const registered = await auth.register(device);
  const { accessToken } = registered.body as { accessToken: string };
  const store = running.app.get<InMemoryStore>(IN_MEMORY_STORE);
  const client = new FeedbackClient(running.app, device, accessToken);
  return {
    running,
    auth,
    device,
    client,
    analyzed: (feedbackId, verdict) => {
      const at = running.clock.now();
      const event: FeedbackAnalyzed = {
        type: 'FeedbackAnalyzed',
        aggregateId: feedbackId as FeedbackId,
        occurredAt: at,
        verdict,
        maskedText: 'Tuvaletler çok kirliydi, sabun da yoktu.',
        sentiment: 'angry',
        topicKey: 'other',
        analyzedAt: at,
      };
      return store.uow.run(() => {
        store.uow.collect([event]);
        return Promise.resolve();
      });
    },
    renewSession: async () => {
      const session = await auth.session(device);
      client.useToken((session.body as { accessToken: string }).accessToken);
    },
  };
}
