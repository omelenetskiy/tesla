import { renderHook, act } from '@testing-library/react'
import { useLocalStorage, usePagination, useDebounce } from '@/lib/hooks/use-data'

describe('Custom Hooks', () => {
  describe('useLocalStorage', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('should initialize with default value', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
      expect(result.current[0]).toBe('default')
    })

    it('should update value', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

      act(() => {
        result.current[1]('updated')
      })

      expect(result.current[0]).toBe('updated')
    })

    it('should persist to localStorage', () => {
      const { result } = renderHook(() => useLocalStorage('test-key', 'initial'))

      act(() => {
        result.current[1]('persisted')
      })

      expect(localStorage.getItem('test-key')).toBe(JSON.stringify('persisted'))
    })
  })

  describe('usePagination', () => {
    it('should initialize with page 1', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1)
      const { result } = renderHook(() => usePagination(items, 10))

      expect(result.current.currentPage).toBe(1)
      expect(result.current.currentItems).toHaveLength(10)
      expect(result.current.totalPages).toBe(3)
    })

    it('should navigate to next page', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1)
      const { result } = renderHook(() => usePagination(items, 10))

      act(() => {
        result.current.setCurrentPage(2)
      })

      expect(result.current.currentPage).toBe(2)
      expect(result.current.hasNextPage).toBe(true)
      expect(result.current.hasPrevPage).toBe(true)
    })

    it('should not navigate beyond total pages', () => {
      const items = Array.from({ length: 25 }, (_, i) => i + 1)
      const { result } = renderHook(() => usePagination(items, 10))

      act(() => {
        result.current.setCurrentPage(3)
      })

      expect(result.current.hasNextPage).toBe(false)
    })
  })

  describe('useDebounce', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })

    it('should debounce value changes', () => {
      const { result, rerender } = renderHook(({ value, delay }) => useDebounce(value, delay), {
        initialProps: { value: 'initial', delay: 500 },
      })

      expect(result.current).toBe('initial')

      rerender({ value: 'updated', delay: 500 })
      expect(result.current).toBe('initial')

      act(() => {
        jest.advanceTimersByTime(500)
      })

      expect(result.current).toBe('updated')
    })
  })
})

