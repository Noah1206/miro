import { describe, expect, it } from 'vitest'
import { chatViewportState } from './chat-viewport'
const full = {height:800,width:390,scale:1,offsetTop:0,offsetLeft:0}
describe('chat keyboard viewport', () => {
  it('fits the visible viewport with the keyboard open', () => {
    expect(chatViewportState({...full,height:450,offsetTop:40},800,true)).toMatchObject({keyboard:true,height:450,top:40,width:390,left:0})
  })
  it('still detects the keyboard after Safari has zoomed an input', () => {
    expect(chatViewportState({...full,height:400,width:350,scale:1.1,offsetLeft:20},800,true)).toMatchObject({keyboard:true,width:350,left:20})
  })
  it('does not mistake pinch zoom or a browser toolbar for a keyboard', () => {
    expect(chatViewportState({...full,height:400,width:195,scale:2},800,true).keyboard).toBe(false)
    expect(chatViewportState({...full,height:720},800,true).keyboard).toBe(false)
  })
  it('releases keyboard layout when focus leaves the chat', () => {
    expect(chatViewportState({...full,height:450},800,false).keyboard).toBe(false)
  })
})
