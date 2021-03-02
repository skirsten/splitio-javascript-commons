import { IReadinessManager } from '../../readiness/types';
import { ISplitApi } from '../../services/types';
import { IStorageSync } from '../../storages/types';
import { ISettings } from '../../types';
import { ITask, ISyncTask } from '../types';

export interface ISplitsSyncTask extends ISyncTask<[noCache?: boolean], boolean> { }

export interface ISegmentsSyncTask extends ISyncTask<[segmentNames?: string[], noCache?: boolean, fetchOnlyNew?: boolean], boolean> { }

export interface IPollingManager extends ITask {
  syncAll(): Promise<any>
  splitsSyncTask: ISplitsSyncTask
  segmentsSyncTask: ISegmentsSyncTask
}

/**
 * PollingManager for client-side with support for multiple clients
 */
export interface IPollingManagerCS extends IPollingManager {
  add(matchingKey: string, readiness: IReadinessManager, storage: IStorageSync): ISegmentsSyncTask
  remove(matchingKey: string): void;
  get(matchingKey: string): ISegmentsSyncTask | undefined
}

/**
 * Signature of polling manager factory/constructor
 */
export type IPollingManagerFactoryParams = [
  splitApi: ISplitApi,
  storage: IStorageSync,
  readiness: IReadinessManager,
  settings: ISettings,
]
