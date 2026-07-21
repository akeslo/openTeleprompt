import { describe, it, expect, vi } from 'vitest'
import { API } from './api.js'

describe('API — Tauri IPC bridge', () => {
  describe('API object structure', () => {
    it('exports API object', () => {
      expect(API).toBeDefined()
      expect(typeof API).toBe('object')
    })

    it('has all required command methods', () => {
      const commands = [
        'elevateNotchWindow',
        'getConfig',
        'setConfig',
        'getScripts',
        'saveScripts',
        'setIgnoreMouse',
        'resizePrompter',
        'resizeSettings',
        'quit',
        'openDevTools',
        'moveWindow',
        'getWindowPos',
        'startDrag',
        'focusPrompter',
        'openFile',
        'saveFile',
        'togglePassThrough',
      ]
      commands.forEach(cmd => {
        expect(API).toHaveProperty(cmd)
        expect(typeof API[cmd]).toBe('function')
      })
    })

    it('has all required event listener methods', () => {
      const listeners = ['onConfigUpdate', 'onShortcut']
      listeners.forEach(listener => {
        expect(API).toHaveProperty(listener)
        expect(typeof API[listener]).toBe('function')
      })
    })

    it('has platform property', () => {
      expect(API).toHaveProperty('platform')
      expect(['darwin', 'win32']).toContain(API.platform)
    })
  })

  describe('command method behavior', () => {
    it('getConfig returns a promise', () => {
      const result = API.getConfig()
      expect(result).toBeInstanceOf(Promise)
    })

    it('setConfig accepts a patch object and returns a promise', () => {
      const result = API.setConfig({ opacity: 0.8 })
      expect(result).toBeInstanceOf(Promise)
    })

    it('saveScripts accepts scripts array and returns a promise', () => {
      const scripts = [{ name: 'Test', content: '' }]
      const result = API.saveScripts(scripts)
      expect(result).toBeInstanceOf(Promise)
    })

    it('saveFile accepts path and content and returns a promise', () => {
      const result = API.saveFile('/test.txt', 'content')
      expect(result).toBeInstanceOf(Promise)
    })

    it('quit returns a promise', () => {
      const result = API.quit()
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('listener method behavior', () => {
    it('onConfigUpdate accepts callback and returns a promise', () => {
      const callback = vi.fn()
      const result = API.onConfigUpdate(callback)
      expect(result).toBeInstanceOf(Promise)
    })

    it('onShortcut accepts callback and returns a promise', () => {
      const callback = vi.fn()
      const result = API.onShortcut(callback)
      expect(result).toBeInstanceOf(Promise)
    })
  })

  describe('platform detection', () => {
    it('platform is either darwin or win32', () => {
      expect(['darwin', 'win32']).toContain(API.platform)
    })
  })
})
