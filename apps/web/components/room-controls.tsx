'use client'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

export type RoomPanel = 'persona' | 'theme' | 'model' | 'memory'
type Controls = {
  request: { panel: RoomPanel; revision: number } | null
  openRoomPanel: (panel: RoomPanel) => void
  pickerOpen: boolean; setPickerOpen: (open: boolean) => void
}
const Context = createContext<Controls | null>(null)
export function RoomControlsProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Controls['request']>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const openRoomPanel = useCallback((panel: RoomPanel) => {
    setPickerOpen(false)
    setRequest(previous => ({ panel, revision: (previous?.revision ?? 0) + 1 }))
  }, [])
  return <Context.Provider value={{ request, openRoomPanel, pickerOpen, setPickerOpen }}>{children}</Context.Provider>
}
export function useRoomControls() {
  const value = useContext(Context)
  if (!value) throw new Error('RoomControlsProvider missing')
  return value
}
