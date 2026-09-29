import { createEmitter } from "@plainworks/std/emitter"
import { expect, test } from "vitest"
import { recordEvents } from "./events"

test("a recorder captures what an emitter delivers, in order", () => {
  const emitter = createEmitter<number>()
  const recorder = recordEvents<number>()
  emitter.subscribe(recorder.listener)

  emitter.emit(1)
  emitter.emit(2)

  expect(recorder.events).toEqual([1, 2])
})

test("recorder.clear drops captured values", () => {
  const rec = recordEvents<number>()
  rec.listener(1)
  rec.clear()
  rec.listener(2)
  expect(rec.events).toEqual([2])
})
