/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Duration } from 'luxon';
import { z } from 'zod';

/**
 * Options that apply to the acquiral of a given lock.
 *
 * @public
 */
export interface LockOptions {
  /**
   * The maximum amount of time that the lock can be held, before it's
   * considered timed out and gets auto-released by the framework.
   */
  timeout: Duration;
}

/**
 * Options that apply to the invocation of a given task.
 *
 * @public
 */
export interface TaskOptions {
  /**
   * The maximum amount of time that a single task invocation can take, before
   * it's considered timed out and gets "released" such that a new invocation
   * is permitted to take place (possibly, then, on a different worker).
   *
   * If no value is given for this field then there is no timeout. This is
   * potentially dangerous.
   */
  timeout?: Duration;

  /**
   * The amount of time that should pass between task invocation starts.
   * Essentially, this equals roughly how often you want the task to run.
   *
   * This is a best effort value; under some circumstances there can be
   * deviations. For example, if the task runtime is longer than the frequency
   * and the timeout has not been given or not been exceeded yet, the next
   * invocation of this task will be delayed until after the previous one
   * finishes.
   *
   * The system does its best to avoid overlapping invocations.
   *
   * If no value is given for this field then the task will only be invoked
   * once (on any worker) and then unscheduled automatically.
   */
  frequency?: Duration;

  /**
   * The amount of time that should pass before the first invocation happens.
   *
   * This can be useful in cold start scenarios to stagger or delay some heavy
   * compute jobs.
   *
   * If no value is given for this field then the first invocation will happen
   * as soon as possible.
   */
  initialDelay?: Duration;
}

/**
 * Deals with management and locking related to distributed tasks, for a given
 * plugin.
 *
 * @public
 */
export interface PluginTaskManager {
  /**
   * Attempts to acquire an exclusive lock.
   *
   * A lock can only be held by one party at a time. Any subsequent attempts to
   * acquire the lock will fail, unless the timeout period has been exceeded or
   * the lock was released by the previous holder.
   *
   * @param id - A unique ID (within the scope of the plugin) for a lock
   * @param options - Options for the lock
   * @returns The result of the lock attempt. If it was successfully acquired,
   *          you should remember to call its `release` method as soon as you
   *          are done with the lock.
   */
  acquireLock(
    id: string,
    options: LockOptions,
  ): Promise<
    { acquired: false } | { acquired: true; release(): Promise<void> }
  >;

  /**
   * Schedules a task function for coordinated exclusive invocation across
   * workers.
   *
   * If the task was already scheduled since before by us or by another party,
   * its options are just overwritten with the given options, and things
   * continue from there.
   *
   * @param id - A unique ID (within the scope of the plugin) for the task
   * @param options - Options for the task
   * @param fn - The actual task function to be invoked
   * @returns An `unschedule` function that can be used to stop the task
   *          invocations later on. This removes the task entirely from storage
   *          and stops its invocations across all workers.
   */
  scheduleTask(
    id: string,
    options: TaskOptions,
    fn: () => void | Promise<void>,
  ): Promise<{ unschedule: () => Promise<void> }>;
}

function isValidOptionalDurationString(d: string | undefined): boolean {
  try {
    return !d || Duration.fromISO(d).isValid === true;
  } catch {
    return false;
  }
}

export const taskSettingsV1Schema = z.object({
  version: z.literal(1),
  initialDelayDuration: z
    .string()
    .optional()
    .refine(isValidOptionalDurationString, { message: 'Invalid duration' }),
  recurringAtMostEveryDuration: z
    .string()
    .optional()
    .refine(isValidOptionalDurationString, { message: 'Invalid duration' }),
  timeoutAfterDuration: z
    .string()
    .optional()
    .refine(isValidOptionalDurationString, { message: 'Invalid duration' }),
});

/**
 * The properties that control a scheduled task (version 1).
 */
export type TaskSettingsV1 = z.infer<typeof taskSettingsV1Schema>;