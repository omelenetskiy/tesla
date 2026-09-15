import { calculateTripStats, calculateChargingStats, estimateRange } from '@/lib/utils/stats'

describe('Statistics Utilities', () => {
  describe('calculateTripStats', () => {
    it('should calculate stats for single trip', () => {
      const trips = [
        {
          distance: 45.2,
          efficiency: 220,
          maxSpeed: 120,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        },
      ]

      const stats = calculateTripStats(trips)

      expect(stats.totalDistance).toBe(45.2)
      expect(stats.totalTrips).toBe(1)
      expect(stats.avgDistance).toBe(45.2)
      expect(stats.avgEfficiency).toBe(220)
      expect(stats.maxSpeed).toBe(120)
    })

    it('should return zeros for empty trips', () => {
      const stats = calculateTripStats([])

      expect(stats.totalDistance).toBe(0)
      expect(stats.totalTrips).toBe(0)
      expect(stats.avgDistance).toBe(0)
    })

    it('should calculate average for multiple trips', () => {
      const trips = [
        {
          distance: 50,
          efficiency: 200,
          maxSpeed: 100,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        },
        {
          distance: 50,
          efficiency: 240,
          maxSpeed: 120,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        },
      ]

      const stats = calculateTripStats(trips)

      expect(stats.totalTrips).toBe(2)
      expect(stats.totalDistance).toBe(100)
      expect(stats.avgEfficiency).toBe(220)
    })
  })

  describe('calculateChargingStats', () => {
    it('should calculate charging statistics', () => {
      const sessions = [
        {
          energyAdded: 50,
          cost: 10,
          startTime: new Date().toISOString(),
          endTime: new Date(Date.now() + 3600000).toISOString(),
        },
      ]

      const stats = calculateChargingStats(sessions)

      expect(stats.totalSessions).toBe(1)
      expect(stats.totalEnergyAdded).toBe(50)
      expect(stats.avgEnergy).toBe(50)
      expect(stats.costTotal).toBe(10)
    })
  })

  describe('estimateRange', () => {
    it('should estimate range based on battery and efficiency', () => {
      const range = estimateRange(75, 220) // 75%, 220 Wh/km

      expect(range).toBeGreaterThan(200)
      expect(range).toBeLessThan(350)
    })

    it('should return 0 for 0% battery', () => {
      const range = estimateRange(0, 220)
      expect(range).toBe(0)
    })
  })
})

