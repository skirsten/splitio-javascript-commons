import { uniqueId } from '../lang';
import { timer } from './timer';
import { thenable } from '../promise/thenable';
import { ILogger } from '../../logger/types';
import { IResponse } from '../../services/types';

// Based on ProducerMetricsCollector and ClientCollector classes
interface MetricsCollector {
  // ProducerMetricsCollector API
  countException(): void,
  count(status: number): void,
  latency(ms: number): void,

  // ClientCollector API
  ready(ms: number): void,
  getTreatment(ms: number): void,
  getTreatments(ms: number): void,
  getTreatmentWithConfig(ms: number): void,
  getTreatmentsWithConfig(ms: number): void,

  [method: string]: (ms: number) => void,
}

// Map we will use for storing timers data
const timers: Record<string, {
  cb: false | ((et: number) => void),
  timer: () => number
}> = {};

// Tasks constants
const CONSTANTS = {
  SDK_READY: 'Getting ready - Split SDK',
  SDK_GET_TREATMENT: 'SDK - Get Treatment',
  SDK_GET_TREATMENTS: 'SDK - Get Treatments',
  SDK_GET_TREATMENT_WITH_CONFIG: 'SDK - Get Treatment with config',
  SDK_GET_TREATMENTS_WITH_CONFIG: 'SDK - Get Treatments with config',
  SPLITS_READY: 'Getting ready - Splits',
  SEGMENTS_READY: 'Getting ready - Segments',
  METRICS_PUSH: 'Pushing - Metrics',
  IMPRESSIONS_PUSH: 'Pushing - Impressions',
  EVENTS_PUSH: 'Pushing - Events',
  MY_SEGMENTS_FETCH: 'Fetching - My Segments',
  SEGMENTS_FETCH: 'Fetching - Segments',
  SPLITS_FETCH: 'Fetching - Splits'
};
// Tasks callbacks, if any
const CALLBACKS = {
  [CONSTANTS.SDK_READY]: {
    collector: 'client',
    method: 'ready'
  },
  [CONSTANTS.SDK_GET_TREATMENT]: {
    collector: 'client',
    method: 'getTreatment'
  },
  [CONSTANTS.SDK_GET_TREATMENTS]: {
    collector: 'client',
    method: 'getTreatments'
  },
  [CONSTANTS.SDK_GET_TREATMENT_WITH_CONFIG]: {
    collector: 'client',
    method: 'getTreatmentWithConfig'
  },
  [CONSTANTS.SDK_GET_TREATMENTS_WITH_CONFIG]: {
    collector: 'client',
    method: 'getTreatmentsWithConfig'
  },
  [CONSTANTS.MY_SEGMENTS_FETCH]: {
    collector: 'mySegments',
    method: 'latency'
  },
  [CONSTANTS.SEGMENTS_FETCH]: {
    collector: 'segmentChanges',
    method: 'latency'
  },
  [CONSTANTS.SPLITS_FETCH]: {
    collector: 'splitChanges',
    method: 'latency'
  }
};
/**
 * Generates the timer keys using the task name and a modifier, if any.
 * @param {string} task - The task name
 * @param {number | string} modifier - (optional) The modifier, if any.
 * @return {string} The generated timer key
 */
function generateTimerKey(task: string, modifier?: number | string) { return modifier ? task + modifier : task; }
/**
 * Given the collectors map, it returns the specific collector for a given task.
 *
 * @param {string} task - The task name
 * @param {Object} collectors - The collectors map
 */
function getCollectorForTask(task: string, collectors?: Record<string, MetricsCollector>): false | MetricsCollector {
  const callbackData = CALLBACKS[task];

  if (callbackData && collectors) return collectors[callbackData.collector];

  return false;
}
/**
 * Given a collector and a task, returns the callback function that should be called when we stop the timer.
 *
 * @param {string} task - The task name
 * @param {Object} collector - The collector object for the task
 */
function getCallbackForTask(task: string, collector: MetricsCollector | false): ((ms: number) => void) | false {
  const callbackData = CALLBACKS[task];

  if (callbackData && collector) return collector[callbackData.method];

  return false;
}

// Our "time tracker" API
export const TrackerAPI = {
  /**
   * "Private" method, used to attach count/countException and stop callbacks to a promise.
   *
   * @param {ILogger} log - Logger.
   * @param {Promise} promise - The promise we want to attach the callbacks.
   * @param {string} task - The name of the task.
   * @param {number | string} modifier - (optional) The modifier for the task, if any.
   */
  __attachToPromise(log: ILogger, promise: Promise<IResponse>, task: string, collector: false | MetricsCollector, modifier?: number | string) {
    return promise.then(resp => {
      this.stop(log, task, modifier);

      if (collector && collector.count) collector.count(resp.status);

      return resp;
    })
      .catch(err => {
        this.stop(log, task, modifier);

        if (collector && collector.countException) collector.countException();

        throw err;
      });
  },
  /**
   * Starts tracking the time for a given task. All tasks tracked are considered "unique" because
   * there may be multiple SDK instances tracking a "generic" task, making any task non-generic.
   *
   * @param {ILogger} log - Logger.
   * @param {string} task - The task we are starting.
   * @param {Object} collectors - The collectors map.
   * @param {Promise} promise - (optional) The promise we are tracking.
   * @return {Function | Promise} The stop function for this specific task or the promise received with the callbacks registered.
   */
  start(log: ILogger, task: string, collectors?: Record<string, MetricsCollector>, promise?: Promise<IResponse>, now?: () => number): Promise<IResponse> | (() => number) {
    const taskUniqueId = uniqueId();
    const taskCollector = getCollectorForTask(task, collectors);
    let result;

    // If we are registering a promise with this task, we should count the status and the exceptions as well
    // as stopping the task when the promise resolves. Then return the promise
    if (thenable(promise)) {
      result = this.__attachToPromise(log, promise, task, taskCollector, taskUniqueId);
    } else {
      // If not, we return the stop function, as it will be stopped manually.
      result = this.stop.bind(this, log, task, taskUniqueId);
      if (CALLBACKS[task] && !taskCollector) {
        // and provide a way for a defered setup of the collector, if needed.
        // @ts-expect-error
        result.setCollectorForTask = this.setCollectorForTask.bind(this, task, taskUniqueId);
      }
    }

    // We start the timer, with an uniqueId attached to it's name, and save tracking info for this task.
    const trackingKey = generateTimerKey(task, taskUniqueId);
    const cb = getCallbackForTask(task, taskCollector);
    timers[trackingKey] = {
      cb,
      timer: timer(now)
    };

    return result as () => number;
  },
  /**
   * Setup the collector for a task that reports metrics.
   *
   * @param {string} task - The task name
   * @param {number | string} taskUniqueId - The unique identifier for this task
   * @param {Object} collectors - The collectors map.
   */
  setCollectorForTask(task: string, taskUniqueId: number | string, collectors: Record<string, MetricsCollector>) {
    const taskCollector = getCollectorForTask(task, collectors);

    if (taskCollector) {
      const trackingKey = generateTimerKey(task, taskUniqueId);
      timers[trackingKey].cb = getCallbackForTask(task, taskCollector);
    }
  },
  /**
   * Stops the tracking of a given task.
   *
   * @param {ILogger} log - Logger.
   * @param {string} task - The task we are starting.
   * @param {number | string} modifier - (optional) The modifier for that specific task.
   */
  stop(log: ILogger, task: string, modifier?: number | string) {
    const timerName = generateTimerKey(task, modifier);
    const timerData = timers[timerName];
    if (timerData) {
      // Stop the timer and round result for readability.
      const et = timerData.timer();
      log.debug(`[TIME TRACKER]: [${task}] took ${et}ms to finish.`);

      // Check if we have a tracker callback.
      if (timerData.cb) {
        // If we have a callback, we call it with the elapsed time of the task and then delete the reference.
        timerData.cb(et);
      }

      // Remove the task tracking reference.
      delete timers[timerName];

      return et;
    }
  },
  /**
   * The constants shortcut for the task names.
   */
  TaskNames: CONSTANTS
};
