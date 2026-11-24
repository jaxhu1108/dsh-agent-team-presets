/** Production session observations with search disabled for cold-resume tests. */
import SessionQuery from '@deepseek-ai/dsh-session-query'

export class FixtureSessionQuery extends SessionQuery {
  static override inject = ['sessions', 'sessionPersistence']
  override searchSessions(): Promise<never> { return Promise.reject(new Error('Fixture does not search')) }
  override searchEvents(): Promise<never> { return Promise.reject(new Error('Fixture does not search')) }
}
