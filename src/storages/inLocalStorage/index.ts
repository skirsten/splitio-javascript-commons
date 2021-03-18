import ImpressionsCacheInMemory from '../inMemory/ImpressionsCacheInMemory';
import ImpressionCountsCacheInMemory from '../inMemory/ImpressionCountsCacheInMemory';
import EventsCacheInMemory from '../inMemory/EventsCacheInMemory';
import { IStorageFactoryParams, IStorageSyncCS } from '../types';
import KeyBuilderCS from '../KeyBuilderCS';
import { isLocalStorageAvailable } from '../../utils/env/isLocalStorageAvailable';
import SplitsCacheInLocal from './SplitsCacheInLocal';
import MySegmentsCacheInLocal from './MySegmentsCacheInLocal';
import MySegmentsCacheInMemory from '../inMemory/MySegmentsCacheInMemory';
import SplitsCacheInMemory from '../inMemory/SplitsCacheInMemory';
import { DEFAULT_CACHE_EXPIRATION_IN_MILLIS } from '../../utils/constants/browser';
import { InMemoryStorageCSFactory } from '../inMemory/InMemoryStorageCS';

export const logPrefix = 'storage:localstorage: ';

export interface InLocalStorageOptions {
  prefix?: string
}

/**
 * InLocal storage factory for standalone client-side SplitFactory
 */
export function InLocalStorage(options: InLocalStorageOptions = {}) {

  const prefix = options.prefix ? options.prefix + '.SPLITIO' : 'SPLITIO';

  return function InLocalStorageCSFactory(params: IStorageFactoryParams): IStorageSyncCS {

    // Fallback to InMemoryStorage if LocalStorage API is not available
    if (!isLocalStorageAvailable()) {
      params.log.warn(logPrefix + 'LocalStorage API is unavailable. Fallbacking into default MEMORY storage');
      return InMemoryStorageCSFactory(params);
    }

    const log = params.log;
    const keys = new KeyBuilderCS(prefix, params.matchingKey as string);
    const expirationTimestamp = Date.now() - DEFAULT_CACHE_EXPIRATION_IN_MILLIS;

    return {
      splits: new SplitsCacheInLocal(log, keys, expirationTimestamp, params.splitFiltersValidation),
      segments: new MySegmentsCacheInLocal(log, keys),
      impressions: new ImpressionsCacheInMemory(),
      impressionCounts: params.optimize ? new ImpressionCountsCacheInMemory() : undefined,
      events: new EventsCacheInMemory(params.eventsQueueSize),

      destroy() {
        this.splits = new SplitsCacheInMemory();
        this.segments = new MySegmentsCacheInMemory();
        this.impressions.clear();
        this.impressionCounts && this.impressionCounts.clear();
        this.events.clear();
      },

      // When using shared instanciation with MEMORY we reuse everything but segments (they are customer per key).
      shared(matchingKey: string) {
        const childKeysBuilder = new KeyBuilderCS(prefix, matchingKey);

        return {
          splits: this.splits,
          segments: new MySegmentsCacheInLocal(log, childKeysBuilder),
          impressions: this.impressions,
          impressionCounts: this.impressionCounts,
          events: this.events,

          destroy() {
            this.splits = new SplitsCacheInMemory();
            this.segments = new MySegmentsCacheInMemory();
          }
        };
      },
    };
  };
}
