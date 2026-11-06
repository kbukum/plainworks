"use client"

import { Button } from "@plainworks/elements/button"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@plainworks/elements/popover"
import { Progress } from "@plainworks/elements/progress"
import { cn } from "@plainworks/theme"
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react"

/** Where a {@link TrayTask} is. */
export type TrayTaskState = "running" | "done" | "failed" | "cancelled"

/** One long-running task in a {@link ProgressTray}. */
export interface TrayTask {
  readonly id: string
  /** What the task is about; it names the task's progress bar and buttons. */
  readonly title: string
  /** A short fact, such as how much is done or why it failed. */
  readonly detail?: ReactNode
  /** Percent done, 0–100; leave it unset when the task can't say, and no number is made up. */
  readonly progress?: number
  readonly state: TrayTaskState
}

/** Words a {@link ProgressTray} shows; override them to translate. */
export interface ProgressTrayLabels {
  readonly running: string
  readonly done: string
  readonly failed: string
  readonly cancelled: string
  readonly cancel: string
  readonly dismiss: string
  readonly empty: string
}

export const defaultProgressTrayLabels: ProgressTrayLabels = {
  running: "Running",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  cancel: "Cancel",
  dismiss: "Dismiss",
  empty: "Nothing running.",
}

/** Props for {@link ProgressTray}. */
export interface ProgressTrayProps {
  /** Names the button and the list, such as "Downloads". */
  readonly label: string
  /** The tasks to show, newest first or in any order the host keeps. */
  readonly tasks: readonly TrayTask[]
  /** Called to cancel a running task; without it, running tasks have no Cancel. */
  readonly onCancel?: (id: string) => void
  /** Called to remove a finished task; without it, finished tasks have no Dismiss. */
  readonly onDismiss?: (id: string) => void
  readonly labels?: Partial<ProgressTrayLabels>
  readonly className?: string
}

const word = (state: TrayTaskState, copy: ProgressTrayLabels): string => copy[state]

/**
 * A header button that follows long-running tasks, such as downloads, while the user keeps working.
 * The button shows how many are running and opens a list of every task with its progress, state and
 * detail, where a running task can be cancelled and a finished one dismissed. A task that finishes
 * is announced politely, whether or not the list is open.
 */
export function ProgressTray({
  label,
  tasks,
  onCancel,
  onDismiss,
  labels,
  className,
}: ProgressTrayProps): ReactElement {
  const copy = useMemo(() => ({ ...defaultProgressTrayLabels, ...labels }), [labels])
  const baseId = useId()
  const running = tasks.filter((task) => task.state === "running").length
  const [announcement, setAnnouncement] = useState("")
  const seen = useRef(new Map<string, TrayTaskState>())

  useEffect(() => {
    const finished = tasks.filter(
      (task) => task.state !== "running" && seen.current.get(task.id) === "running",
    )
    seen.current = new Map(tasks.map((task) => [task.id, task.state]))
    if (finished.length > 0)
      setAnnouncement(finished.map((task) => `${task.title}: ${word(task.state, copy)}`).join(". "))
  }, [tasks, copy])

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              aria-label={
                running > 0 ? `${label}, ${running} ${copy.running.toLowerCase()}` : label
              }
              className={cn("gap-1.5", className)}
            />
          }
        >
          <span aria-hidden="true">↓</span>
          {running > 0 ? (
            <span
              aria-hidden="true"
              className="rounded-full bg-primary px-1.5 text-caption font-semibold text-primary-foreground tabular-nums"
            >
              {running}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
          <PopoverTitle id={`${baseId}title`}>{label}</PopoverTitle>
          {tasks.length === 0 ? (
            <p className="text-muted-foreground">{copy.empty}</p>
          ) : (
            <ul aria-labelledby={`${baseId}title`} className="grid max-h-80 gap-3 overflow-y-auto">
              {tasks.map((task, index) => {
                const titleId = `${baseId}${index}`
                return (
                  <li key={task.id} className="grid gap-1.5" data-state={task.state}>
                    <div className="flex items-start justify-between gap-2">
                      <span
                        id={titleId}
                        data-slot="progress-tray-title"
                        className="min-w-0 font-medium break-words"
                      >
                        {task.title}
                      </span>
                      {task.state === "running" && onCancel !== undefined ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`${copy.cancel} ${task.title}`}
                          onClick={() => onCancel(task.id)}
                        >
                          {copy.cancel}
                        </Button>
                      ) : null}
                      {task.state !== "running" && onDismiss !== undefined ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          aria-label={`${copy.dismiss} ${task.title}`}
                          onClick={() => onDismiss(task.id)}
                        >
                          {copy.dismiss}
                        </Button>
                      ) : null}
                    </div>
                    {task.state === "running" && task.progress !== undefined ? (
                      <Progress value={task.progress} aria-labelledby={titleId} />
                    ) : null}
                    <span
                      className={cn(
                        "text-caption text-muted-foreground",
                        task.state === "failed" && "text-destructive",
                      )}
                    >
                      <span>{word(task.state, copy)}</span>
                      {task.detail === undefined ? null : (
                        <>
                          {" · "}
                          <span>{task.detail}</span>
                        </>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </PopoverContent>
      </Popover>
    </>
  )
}
