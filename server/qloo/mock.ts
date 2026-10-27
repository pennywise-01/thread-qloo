import type {
  Capabilities,
  Envelope,
  QlooPlace,
  QlooPort,
  RankInput,
  RankedOption,
} from './port';
import { emptyEnvelope } from './port';

/**
 * Mock adapter.
 *
 * Thread's mock ranking is deliberately legible rather than simulated: the
 * engine scores venues from the interest tags you ticked, so a judge can see
 * why a place came back. That logic lives in `server/thread/engine.ts` and only
 * runs when no Qloo scores are present.
 *
 * This adapter exists so the pipeline has one shape in both modes, and so
 * `npm run dev` works with no credential.
 */
export class MockQlooAdapter implements QlooPort {
  readonly mode = 'mock' as const;

  async capabilities(): Promise<Capabilities> {
    return {
      ready: true,
      harnessVersion: null,
      detail: 'Local ranking from interest tags. No credential, no network calls.',
    };
  }

  async rank(_input: RankInput): Promise<Envelope<RankedOption>> {
    return emptyEnvelope(
      'Local ranking in use. Set QLOO_MODE=live to rank through the Qloo harness.',
    );
  }

  async searchEntities(): Promise<Envelope<{ id: string; name: string }>> {
    return emptyEnvelope('Mock mode does not call Qloo.');
  }

  async findTags(): Promise<Envelope<{ id: string; name: string }>> {
    return emptyEnvelope('Mock mode does not call Qloo.');
  }

  async insights(): Promise<Envelope<QlooPlace>> {
    return emptyEnvelope('Mock mode does not call Qloo.');
  }
}
