'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const STAFF_HOURS = HOURS.slice(0, 13)
const CATS = ['MH', 'SS/FS', 'Pack']
const GROUPS = [
  { id: 'p1', label: '+1', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', rowbg: 'bg-red-50/40' },
  { id: 'p2', label: '+2', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', rowbg: 'bg-yellow-50/40' },
  { id: 'p3', label: '+3', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', rowbg: 'bg-blue-50/40' },
]

type Residuals = { [gid: string]: { [cat: string]: number } }
type Staff = { [cat: string]: number[] }
type SavedData = { [hourKey: string]: { [gid: string]: { [cat: string]: number } } }
type SavedStaff = { [hourKey: string]: { [cat: string]: number[] } }

const defaultResiduals: Residuals = {
  p1: { MH: 0, 'SS/FS': 0, Pack: 0 },
  p2: { MH: 0, 'SS/FS': 0, Pack: 0 },
  p3: { MH: 0, 'SS/FS': 0, Pack: 0 },
}

const defaultStaff: Staff = {
  MH:      [2,6,6,6,6,6,6,3,3,3,3,1,1],
  'SS/FS': [0,2,2,2,2,2,2,1,1,1,1,1,1],
  Pack:    [0,6,6,6,6,6,6,6,6,3,3,3,3],
}

const defaultCap: { [cat: string]: number } = { MH: 20, 'SS/FS': 20, Pack: 7 }

function getCurrentTime(): string {
  const now = new Date()
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
}

function getCurrentHourIdx(): number {
  const now = new Date()
  const h = Math.max(8, Math.min(20, now.getHours()))
  return HOURS.indexOf(h.toString().padStart(2, '0') + ':00')
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function getHourIdxForTime(timeStr: string): number {
  const h = parseInt(timeStr.split(':')[0])
  const clamped = Math.max(8, Math.min(20, h))
  return HOURS.indexOf(clamped.toString().padStart(2, '0') + ':00')
}

export default function Home() {
  const [currentTime, setCurrentTime] = useState(getCurrentTime)
  const [curIdx, setCurIdx] = useState(getCurrentHourIdx)
  const [manualTime, setManualTime] = useState<string | null>(null)
  const [cap, setCap] = useState(defaultCap)
  const [residuals, setResiduals] = useState<Residuals>(defaultResiduals)
  const [staff, setStaff] = useState<Staff>(defaultStaff)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [savedData, setSavedData] = useState<SavedData>({})
  const [savedStaff, setSavedStaff] = useState<SavedStaff>({})
  const [savedTimes, setSavedTimes] = useState<{ [hourKey: string]: string }>({})
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const effectiveCurIdx = manualTime !== null ? getHourIdxForTime(manualTime) : curIdx
  const effectiveTime = manualTime ?? currentTime

  // 保存済みの最後のhour index
  const lastSavedHourIdx = Object.keys(savedStaff).length > 0
    ? getHourIdxForTime(Object.keys(savedStaff).sort().pop()!)
    : -1

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(getCurrentTime())
      if (manualTime === null) setCurIdx(getCurrentHourIdx())
    }, 60000)
    return () => clearInterval(timer)
  }, [manualTime])

  const buildSavedData = useCallback((data: any[]) => {
    const byHour: SavedData = {}
    const times: { [hourKey: string]: string } = {}
    data.forEach((row: any) => {
      const hourKey = HOURS[getHourIdxForTime(row.shift_time)]
      if (!byHour[hourKey]) byHour[hourKey] = {}
      if (!byHour[hourKey][row.group_id]) byHour[hourKey][row.group_id] = {}
      byHour[hourKey][row.group_id][row.category] = row.value
      if (!times[hourKey] || row.shift_time > times[hourKey]) {
        times[hourKey] = row.shift_time
      }
    })
    return { byHour, times }
  }, [])

  const loadTodayData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]

    const { data } = await supabase
      .from('residuals')
      .select('*')
      .gte('recorded_at', `${today}T00:00:00`)
      .lte('recorded_at', `${today}T23:59:59`)
      .order('recorded_at', { ascending: true })

    if (data && data.length > 0) {
      const { byHour, times } = buildSavedData(data)
      setSavedData(byHour)
      setSavedTimes(times)
      const latestHour = Object.keys(byHour).sort().pop()
      if (latestHour) {
        const latest: Residuals = JSON.parse(JSON.stringify(defaultResiduals))
        GROUPS.forEach(g => {
          CATS.forEach(cat => {
            if (byHour[latestHour][g.id]?.[cat] !== undefined) {
              latest[g.id][cat] = byHour[latestHour][g.id][cat]
            }
          })
        })
        setResiduals(latest)
      }
    }

    const { data: staffData } = await supabase
      .from('staff_allocation')
      .select('*')
      .gte('recorded_at', `${today}T00:00:00`)
      .lte('recorded_at', `${today}T23:59:59`)
      .order('recorded_at', { ascending: true })

    if (staffData && staffData.length > 0) {
      const byHour: SavedStaff = {}
      staffData.forEach((row: any) => {
        if (!row.shift_time) return
        const hourKey = HOURS[getHourIdxForTime(row.shift_time)]
        if (!byHour[hourKey]) byHour[hourKey] = { MH: [], 'SS/FS': [], Pack: [] }
        if (!byHour[hourKey][row.category]) byHour[hourKey][row.category] = []
        byHour[hourKey][row.category][row.hour_index] = row.staff_count
      })
      setSavedStaff(byHour)

      const latestStaffHour = Object.keys(byHour).sort().pop()
      if (latestStaffHour) {
        const newStaff: Staff = JSON.parse(JSON.stringify(defaultStaff))
        CATS.forEach(cat => {
          byHour[latestStaffHour][cat]?.forEach((val, hi) => {
            if (val !== undefined) newStaff[cat][hi] = val
          })
        })
        setStaff(newStaff)
      }
    }
  }, [buildSavedData])

  useEffect(() => { loadTodayData() }, [loadTodayData])

  useEffect(() => {
    const channel = supabase
      .channel('residuals-changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'residuals' }, async () => {
        await loadTodayData()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'residuals' }, async () => {
        await loadTodayData()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [loadTodayData])

  function calcTimeline() {
    const result: { [gid: string]: { [cat: string]: (number | null)[] } } = {}
    const gids = ['p1', 'p2', 'p3']

    CATS.forEach(cat => {
      gids.forEach(gid => { result[gid] = result[gid] || {} })
      const rows: { [gid: string]: (number | null)[] } = { p1: [], p2: [], p3: [] }

      const sortedSavedHours = Object.keys(savedData).sort()
      const latestSavedHour = sortedSavedHours[sortedSavedHours.length - 1]
      const latestSaveTime = latestSavedHour ? savedTimes[latestSavedHour] : null

      const startValues: { [gid: string]: number } = {}
      gids.forEach(gid => {
        if (latestSavedHour && savedData[latestSavedHour]?.[gid]?.[cat] !== undefined) {
          startValues[gid] = savedData[latestSavedHour][gid][cat]
        } else {
          startValues[gid] = residuals[gid][cat]
        }
      })

      const saveTimeMin = latestSaveTime ? toMinutes(latestSaveTime) : toMinutes(effectiveTime)

      HOURS.forEach((h, hi) => {
        const latestSaveHourIdx = latestSavedHour ? getHourIdxForTime(latestSavedHour) : -1

        if (hi < latestSaveHourIdx) {
          gids.forEach(gid => {
            const hourData = savedData[h]
            rows[gid].push(hourData?.[gid]?.[cat] !== undefined ? hourData[gid][cat] : null)
          })
          return
        }

        if (hi === latestSaveHourIdx) {
          gids.forEach(gid => { rows[gid].push(startValues[gid]) })
          return
        }

        const hMin = toMinutes(h)
        const elapsedMin = Math.max(0, hMin - saveTimeMin)
        const staffIdx = Math.min(hi - 1, staff[cat].length - 1)
        const staffCount = staff[cat][Math.max(0, staffIdx)] || 0
        const throughputPerMin = (staffCount * cap[cat]) / 60

        const remValues: { [gid: string]: number } = {}
        gids.forEach(gid => { remValues[gid] = startValues[gid] })

        let totalProcessed = Math.max(0, elapsedMin * throughputPerMin)
        for (const gid of gids) {
          const consume = Math.min(Math.max(0, remValues[gid]), totalProcessed)
          remValues[gid] = Math.max(0, remValues[gid] - consume)
          totalProcessed = Math.max(0, totalProcessed - consume)
        }

        gids.forEach(gid => rows[gid].push(Math.max(0, Math.round(remValues[gid]))))
      })

      gids.forEach(gid => { result[gid][cat] = rows[gid] })
    })

    return result
  }

  function getCompletionTime(timeline: ReturnType<typeof calcTimeline>, gid: string, cat: string) {
    const row = timeline[gid][cat]
    for (let i = effectiveCurIdx; i < HOURS.length; i++) {
      if (row[i] === 0) return HOURS[i]
    }
    return 'Tomorrow'
  }

  function getSummaryTime(timeline: ReturnType<typeof calcTimeline>, gid: string) {
    const times = CATS.map(cat => getCompletionTime(timeline, gid, cat))
    if (times.some(t => t === 'Tomorrow')) return 'Tomorrow'
    return times.reduce((a, b) => a > b ? a : b)
  }

  function isSavedCell(hi: number): boolean {
    return !!savedData[HOURS[hi]]
  }

  // hi番目の列が保存済みかどうか（人員配置）
  function isStaffSaved(hi: number): boolean {
    return Object.keys(savedStaff).some(hourKey => {
      const savedHi = getHourIdxForTime(hourKey)
      return savedHi === hi
    })
  }

  // hi番目の列が過去（保存済み時刻より前）かどうか
  function isStaffPast(hi: number): boolean {
    return hi < lastSavedHourIdx
  }

  async function handleSave() {
    setSaving(true)
    const saveTime = effectiveTime

    const rows = GROUPS.flatMap(g =>
      CATS.map(cat => ({
        shift_time: saveTime,
        group_id: g.id,
        category: cat,
        value: residuals[g.id][cat],
      }))
    )
    await supabase.from('residuals').insert(rows)

    const staffRows = CATS.flatMap(cat =>
      staff[cat].map((count, hi) => ({
        shift_time: saveTime,
        category: cat,
        hour_index: hi,
        staff_count: count,
      }))
    )
    await supabase.from('staff_allocation').insert(staffRows)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleReset() {
    setResetting(true)
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('residuals').delete()
      .gte('recorded_at', `${today}T00:00:00`)
      .lte('recorded_at', `${today}T23:59:59`)
    await supabase.from('staff_allocation').delete()
      .gte('recorded_at', `${today}T00:00:00`)
      .lte('recorded_at', `${today}T23:59:59`)
    setResiduals(JSON.parse(JSON.stringify(defaultResiduals)))
    setStaff(JSON.parse(JSON.stringify(defaultStaff)))
    setCap({ ...defaultCap })
    setSavedData({})
    setSavedStaff({})
    setSavedTimes({})
    setManualTime(null)
    setResetting(false)
    setShowResetConfirm(false)
  }

  const timeline = calcTimeline()

  return (
    <main className="p-6 max-w-screen-xl mx-auto text-base">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-medium">Parcel Workload</h1>
        <button onClick={() => setShowResetConfirm(true)} className="text-sm text-red-500 border border-red-200 px-4 py-1.5 rounded-lg hover:bg-red-50">
          🔄 リセット
        </button>
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h2 className="text-base font-medium mb-2">本当にリセットしますか？</h2>
            <p className="text-sm text-gray-500 mb-4">今日のすべての保存データが削除されます。この操作は取り消せません。</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowResetConfirm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">キャンセル</button>
              <button onClick={handleReset} disabled={resetting} className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50">
                {resetting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[280px_1fr] gap-4 items-start">
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500 mb-2">🕐 現在時刻</div>
            <div className="text-xl font-medium text-center mb-2">{currentTime}</div>
            <div className="text-xs text-gray-400 mb-1">手動で時刻を変更</div>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={manualTime ?? HOURS[curIdx]}
              onChange={e => setManualTime(e.target.value)}
            >
              {HOURS.slice(0, -1).map(h => <option key={h}>{h}</option>)}
            </select>
            {manualTime !== null && (
              <button onClick={() => setManualTime(null)} className="mt-2 w-full text-xs text-blue-500 border border-blue-200 rounded-lg py-1 hover:bg-blue-50">
                現在時刻に戻す
              </button>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500 mb-2">⚡ 推定能力（件/時間）</div>
            <div className="grid grid-cols-3 gap-2">
              {CATS.map(cat => (
                <div key={cat}>
                  <div className="text-xs text-gray-400 mb-1">{cat}</div>
                  <input
                    type="number" min={1}
                    className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm text-center"
                    value={cap[cat]}
                    onChange={e => setCap(prev => ({ ...prev, [cat]: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-base">📦 残件数入力</span>
              <button onClick={handleSave} className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700">
                {saving ? '保存中...' : saved ? '✓ 保存済み' : '💾 保存'}
              </button>
            </div>
            {GROUPS.map(g => (
              <div key={g.id} className="mb-3">
                <div className={`text-sm font-medium px-2 py-1 rounded mb-2 ${g.bg} ${g.text}`}>{g.label}</div>
                {CATS.map(cat => (
                  <div key={cat} className="mb-2">
                    <div className="text-sm text-gray-500 mb-1">{cat}残件数</div>
                    <input
                      type="number" min={0}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={residuals[g.id][cat]}
                      onFocus={e => e.target.select()}
                      onChange={e => setResiduals(prev => ({
                        ...prev,
                        [g.id]: { ...prev[g.id], [cat]: parseInt(e.target.value) || 0 }
                      }))}
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            {GROUPS.map(g => {
              const summaryTime = getSummaryTime(timeline, g.id)
              const isTomorrow = summaryTime === 'Tomorrow'
              return (
                <div key={g.id} className={`rounded-xl border-2 p-4 ${g.bg} ${g.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-medium text-sm ${g.text}`}>{g.label}</span>
                    <div className="flex items-center gap-1">
                      {!isTomorrow ? <span className="text-green-500 text-lg">✓</span> : <span className="text-yellow-500">🕐</span>}
                      <span className={`text-sm font-medium ${g.text}`}>{summaryTime}</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 mb-1">現在の残件数</div>
                  {CATS.map(cat => (
                    <div key={cat} className="flex justify-between text-sm py-0.5">
                      <span className="text-gray-500">{cat}</span>
                      <span className="font-medium">{residuals[g.id][cat]}件</span>
                    </div>
                  ))}
                  {isTomorrow && (
                    <>
                      <div className="text-xs text-gray-500 mt-2 mb-1 pt-2 border-t border-gray-200">21:00時点の予測残件数</div>
                      {CATS.map(cat => (
                        <div key={cat} className="flex justify-between text-sm py-0.5">
                          <span className="text-gray-500">{cat}</span>
                          <span className={`font-medium ${(timeline[g.id][cat][HOURS.length - 1] ?? 0) > 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {timeline[g.id][cat][HOURS.length - 1] ?? 0}件
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-medium text-base mb-1">時間別推移テーブル</div>
            <div className="text-xs mb-3"><span className="text-blue-500">青字＝保存済み</span><span className="text-gray-400 ml-2">黒字＝予測</span></div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-400 font-normal w-24"></th>
                    {HOURS.map((h, i) => (
                      <th key={h} className={`py-1 px-2 text-center font-normal w-14 ${i === effectiveCurIdx ? 'bg-blue-100 text-blue-700 rounded' : 'text-gray-400'}`}>
                        <div>{h}</div>
                        {savedTimes[h] && <div className="text-xs text-blue-400">{savedTimes[h]}</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map(g => CATS.map(cat => (
                    <tr key={`${g.id}-${cat}`} className={g.rowbg}>
                      <td className={`py-1.5 px-2 font-medium text-sm ${g.text}`}>{g.label} {cat}</td>
                      {timeline[g.id][cat].map((val, i) => (
                        <td key={i} className={`py-1.5 px-2 text-center text-sm ${i === effectiveCurIdx ? 'bg-blue-50' : ''}`}>
                          {val === null ? '' : (
                            <span className={
                              val === 0 ? 'text-green-600 font-medium'
                              : isSavedCell(i) ? 'text-blue-600 font-medium'
                              : 'text-gray-700'
                            }>
                              {val}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-medium text-base mb-1">人員配置</div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-400 font-normal w-16"></th>
                    {STAFF_HOURS.map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-center font-normal w-14 ${i === effectiveCurIdx ? 'bg-blue-100 text-blue-700 rounded' : 'text-gray-400'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(cat => (
                    <tr key={cat}>
                      <td className="py-1.5 px-2 font-medium text-sm text-gray-600">{cat}</td>
                      {staff[cat].map((val, hi) => {
                        const isPast = isStaffPast(hi)
                        const isSaved = isStaffSaved(hi)
                        return (
                          <td key={hi} className={`py-1 px-1 text-center ${hi === effectiveCurIdx ? 'bg-blue-50' : ''}`}>
                            {isPast && !isSaved ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              <input
                                type="number" min={0} max={99}
                                disabled={isPast}
                                className={`w-12 border rounded px-1 py-1 text-center text-sm font-medium
                                  ${isPast ? 'bg-gray-50 border-gray-100 text-blue-600' :
                                    isSaved ? 'border-blue-200 text-blue-600' :
                                    hi === effectiveCurIdx ? 'border-blue-300 bg-blue-50 text-gray-700' :
                                    'border-gray-200 text-gray-700'}
                                `}
                                value={val}
                                onFocus={e => !isPast && e.target.select()}
                                onChange={e => {
                                  if (isPast) return
                                  setStaff(prev => {
                                    const updated = [...prev[cat]]
                                    updated[hi] = parseInt(e.target.value) || 0
                                    return { ...prev, [cat]: updated }
                                  })
                                }}
                              />
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}