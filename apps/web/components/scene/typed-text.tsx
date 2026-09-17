'use client'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { Mood } from '@miro/domain'
import { Emphasis } from './emphasis'
import { msPerChar, pauseAfter } from './typing'

/**
 * 한 글자씩 나타나는 대사.
 *
 * 검열을 통과한 뒤에만 쓴다 — 뿌리면서 검열하면 부적절한 문장이 잠깐 보였다 사라진다.
 * 즉 이것은 기다림을 줄이는 장치가 아니라, 기다림이 끝난 뒤 답이 "도착하는" 느낌을 주는 장치다.
 *
 * 애니메이션을 줄이는 설정(prefers-reduced-motion)이면 통째로 보여준다.
 */
export function TypedText({ text, mood = 'neutral', onDone, animate = true }: {
  text: string
  mood?: Mood
  onDone?: () => void
  /** 지난 메시지는 이미 다 도착한 것이다 — 다시 칠 이유가 없다. */
  animate?: boolean
}) {
  const reduce = useReducedMotion()
  const instant = !animate || reduce
  const [shown, setShown] = useState(() => (instant ? text.length : 0))
  const done = useRef(onDone)
  done.current = onDone

  useEffect(() => {
    if (instant) { setShown(text.length); done.current?.(); return }
    setShown(0)
    let i = 0
    let timer: ReturnType<typeof setTimeout>
    const speed = msPerChar(text, mood)
    const step = () => {
      i += 1
      setShown(i)
      if (i >= text.length) { done.current?.(); return }
      timer = setTimeout(step, speed + pauseAfter(text[i - 1] ?? '', text[i] ?? '', mood))
    }
    timer = setTimeout(step, speed)
    return () => clearTimeout(timer)
  }, [text, mood, instant])

  // 자르는 위치가 **강조** 한가운데면 별표가 글자로 보인다 — 짝이 맞는 데까지만 넘긴다.
  const visible = instant ? text : trimToPair(text.slice(0, shown))
  return (
    <>
      <Emphasis text={visible} />
      {/* 스크린리더는 완성된 문장을 한 번만 읽는다 — 글자마다 다시 읽지 않는다. */}
      {!instant && shown < text.length && <span className="sr-only" aria-live="off">{text}</span>}
    </>
  )
}

/** 열린 별표는 아직 덜 온 것이다. 마지막 짝이 맞는 자리까지만 보여준다. */
function trimToPair(partial: string): string {
  const stars = (partial.match(/\*/g) ?? []).length
  if (stars % 2 === 0) return partial
  return partial.slice(0, partial.lastIndexOf('*'))
}
