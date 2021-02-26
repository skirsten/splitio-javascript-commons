import { merge } from '../lang';
import mode from './mode';
import { validateSplitFilters } from './splitFilters';
import { API } from '../../logger/sdkLogger';
import { STANDALONE_MODE, OPTIMIZED, LOCALHOST_MODE } from '../constants';
import validImpressionsMode from './impressionsMode';
import { LogLevel } from '../../types';
import { ISettingsInternal, ISettingsValidationParams } from './types';
import { logFactory } from '../../logger/sdkLogger';
const log = logFactory('splitio');

const base = {
  // Define which kind of object you want to retrieve from SplitFactory
  mode: STANDALONE_MODE,

  core: {
    // API token (tight to an environment)
    authorizationKey: undefined,
    // key used in your system (only required for browser version)
    key: undefined,
    // traffic type for the given key (only used on browser version)
    trafficType: undefined,
    // toggle impressions tracking of labels
    labelsEnabled: true,
    // toggle sendind (true) or not sending (false) IP and Host Name with impressions, events, and telemetries requests (only used on nodejs version)
    IPAddressesEnabled: undefined
  },

  scheduler: {
    // fetch feature updates each 30 sec
    featuresRefreshRate: 30,
    // fetch segments updates each 60 sec
    segmentsRefreshRate: 60,
    // publish metrics each 120 sec
    metricsRefreshRate: 120,
    // publish evaluations each 60 sec
    impressionsRefreshRate: 60,
    // fetch offline changes each 15 sec
    offlineRefreshRate: 15,
    // publish events every 60 seconds after the first flush
    eventsPushRate: 60,
    // how many events will be queued before flushing
    eventsQueueSize: 500,
    // backoff base seconds to wait before re attempting to authenticate for push notifications
    authRetryBackoffBase: 1,
    // backoff base seconds to wait before re attempting to connect to streaming
    streamingReconnectBackoffBase: 1
  },

  urls: {
    // CDN having all the information for your environment
    sdk: 'https://sdk.split.io/api',
    // Storage for your SDK events
    events: 'https://events.split.io/api',
    // SDK Auth Server
    auth: 'https://auth.split.io/api',
    // Streaming Server
    streaming: 'https://streaming.split.io',
  },

  // Defines which kind of storage we should instanciate.
  storage: undefined,

  // Defines if the logs are enabled, SDK wide.
  debug: undefined,

  // Defines the impression listener, but will only be used on NodeJS.
  impressionListener: undefined,

  // Instance version.
  version: undefined,

  // List of integrations.
  integrations: undefined,

  // toggle using (true) or not using (false) Server-Side Events for synchronizing storage
  streamingEnabled: true,

  sync: {
    splitFilters: undefined,
    // impressions collection mode
    impressionsMode: OPTIMIZED
  },

  // base logger
  log
};

function fromSecondsToMillis(n: number) {
  return Math.round(n * 1000);
}

function setupLogger(debugValue: any) {
  if (typeof debugValue === 'boolean') {
    if (debugValue) {
      API.enable();
    } else {
      API.disable();
    }
  } else if (typeof debugValue === 'string') {
    API.setLogLevel(debugValue as LogLevel);
  }
}

/**
 * Validates the given config and use it to build a settings object.
 *
 * @param config user defined configuration
 * @param validationParams defaults and fields validators used to validate and creates a settings object from a given config
 */
export function settingsValidation(config: unknown, validationParams: ISettingsValidationParams) {

  const { defaults, runtime, storage, integrations } = validationParams;

  // creates a settings object merging base, defaults and config objects.
  const withDefaults = merge({}, base, defaults, config) as ISettingsInternal;

  // Scheduler periods
  withDefaults.scheduler.featuresRefreshRate = fromSecondsToMillis(withDefaults.scheduler.featuresRefreshRate);
  withDefaults.scheduler.segmentsRefreshRate = fromSecondsToMillis(withDefaults.scheduler.segmentsRefreshRate);
  withDefaults.scheduler.metricsRefreshRate = fromSecondsToMillis(withDefaults.scheduler.metricsRefreshRate);
  withDefaults.scheduler.impressionsRefreshRate = fromSecondsToMillis(withDefaults.scheduler.impressionsRefreshRate);
  withDefaults.scheduler.offlineRefreshRate = fromSecondsToMillis(withDefaults.scheduler.offlineRefreshRate);
  withDefaults.scheduler.eventsPushRate = fromSecondsToMillis(withDefaults.scheduler.eventsPushRate);

  // Startup periods
  withDefaults.startup.requestTimeoutBeforeReady = fromSecondsToMillis(withDefaults.startup.requestTimeoutBeforeReady);
  withDefaults.startup.readyTimeout = fromSecondsToMillis(withDefaults.startup.readyTimeout);
  withDefaults.startup.eventsFirstPushWindow = fromSecondsToMillis(withDefaults.startup.eventsFirstPushWindow);

  // ensure a valid SDK mode
  // @ts-ignore
  withDefaults.mode = mode(withDefaults.core.authorizationKey, withDefaults.mode);

  // ensure a valid Storage based on mode defined.
  // @ts-ignore
  if (storage) withDefaults.storage = storage(withDefaults);

  setupLogger(withDefaults.debug);

  // Although `key` is mandatory according to TS declaration files, it can be omitted in LOCALHOST mode. In that case, the value `localhost_key` is used.
  if (withDefaults.mode === LOCALHOST_MODE && withDefaults.core.key === undefined) {
    withDefaults.core.key = 'localhost_key';
  }

  // Current ip/hostname information
  // @ts-ignore
  withDefaults.runtime = runtime(withDefaults);

  // ensure a valid list of integrations.
  // `integrations` returns an array of valid integration items.
  // @ts-ignore
  if (integrations) withDefaults.integrations = integrations(withDefaults);

  // validate push options
  if (withDefaults.streamingEnabled !== false) { // @ts-ignore
    withDefaults.streamingEnabled = true;
    // Backoff bases.
    // We are not checking if bases are positive numbers. Thus, we might be reauthenticating immediately (`setTimeout` with NaN or negative number)
    withDefaults.scheduler.authRetryBackoffBase = fromSecondsToMillis(withDefaults.scheduler.authRetryBackoffBase);
    withDefaults.scheduler.streamingReconnectBackoffBase = fromSecondsToMillis(withDefaults.scheduler.streamingReconnectBackoffBase);
  }

  // validate the `splitFilters` settings and parse splits query
  const splitFiltersValidation = validateSplitFilters(withDefaults.log, withDefaults.sync.splitFilters, withDefaults.mode);
  withDefaults.sync.splitFilters = splitFiltersValidation.validFilters; // @ts-ignore
  withDefaults.sync.__splitFiltersValidation = splitFiltersValidation;

  // ensure a valid impressionsMode
  withDefaults.sync.impressionsMode = validImpressionsMode(withDefaults.log, withDefaults.sync.impressionsMode);

  return withDefaults;
}
