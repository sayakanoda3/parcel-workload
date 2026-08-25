'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const STAFF_HOURS = HOURS
const CATS = ['MH', 'SS/FS', 'Pack', 'PUP pick', 'PUP pack']
const GROUPS = [
  { id: 'p1', label: '+1', text: 'text-red-600', rowbg: 'bg-red-50/30', headerBg: 'bg-red-50', border: 'border-red-100' },
  { id: 'p2', label: '+2', text: 'text-amber-600', rowbg: 'bg-amber-50/30', headerBg: 'bg-amber-50', border: 'border-amber-100' },
  { id: 'p3', label: '+3', text: 'text-blue-500', rowbg: 'bg-blue-50/30', headerBg: 'bg-blue-50', border: 'border-blue-100' },
]

type Residuals = { [gid: string]: { [cat: string]: number } }
type Staff = { [cat: string]: number[] }
type SavedData = { [hourKey: string]: { [gid: string]: { [cat: string]: number } } }
type SavedStaff = { [hourKey: string]: { [cat: string]: number[] } }

const defaultResiduals: Residuals = {
  p1: { MH: 0, 'SS/FS': 0, Pack: 0, 'PUP pick': 0, 'PUP pack': 0 },
  p2: { MH: 0, 'SS/FS': 0, Pack: 0, 'PUP pick': 0, 'PUP pack': 0 },
  p3: { MH: 0, 'SS/FS': 0, Pack: 0, 'PUP pick': 0, 'PUP pack': 0 },
}

const defaultStaff: Staff = {
  MH:          [2,6,6,6,6,6,6,3,3,3,3,1,1,0],
  'SS/FS':     [0,2,2,2,2,2,2,1,1,1,1,1,1,0],
  Pack:        [0,6,6,6,6,6,6,6,6,3,3,3,3,0],
  'PUP pick':  [0,2,2,2,2,2,2,2,2,1,1,1,1,0],
  'PUP pack':  [0,2,2,2,2,2,2,2,2,1,1,1,1,0],
}

const defaultCap: { [cat: string]: number } = { MH: 40, 'SS/FS': 30, Pack: 7, 'PUP pick': 7, 'PUP pack': 7 }

function getCurrentTime(): string {
  const now = new Date()
  return now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')
}

function getCurrentHourIdx(): number {
  const now = new Date()
  const h = Math.max(8, Math.min(21, now.getHours()))
  return HOURS.indexOf(h.toString().padStart(2, '0') + ':00')
}

function toMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

function getHourIdxForTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  const roundedH = m >= 30 ? h + 1 : h
  const clamped = Math.max(8, Math.min(21, roundedH))
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
  const [showInputPopup, setShowInputPopup] = useState(false)
  const [openGroups, setOpenGroups] = useState<{ [gid: string]: boolean }>({ p1: true, p2: true, p3: true })

  const effectiveCurIdx = manualTime !== null ? getHourIdxForTime(manualTime) : curIdx
  const effectiveTime = manualTime ?? currentTime

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
      // ⑤ 保存データがある日付のみ開く
      const newOpen: { [gid: string]: boolean } = { p1: false, p2: false, p3: false }
      let anyOpen = false
      GROUPS.forEach(g => {
        const hasData = Object.values(byHour).some(hourData =>
          CATS.some(cat => (hourData[g.id]?.[cat] ?? 0) > 0)
        )
        if (hasData) { newOpen[g.id] = true; anyOpen = true }
      })
      if (!anyOpen) { newOpen.p1 = true; newOpen.p2 = true; newOpen.p3 = true }
      setOpenGroups(newOpen)
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
        if (!byHour[hourKey]) byHour[hourKey] = { MH: [], 'SS/FS': [], Pack: [], 'PUP pick': [], 'PUP pack': [] }
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
      const latestSaveHourIdx = latestSavedHour ? getHourIdxForTime(latestSavedHour) : -1

      HOURS.forEach((h, hi) => {
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
        if (latestSaveHourIdx === -1 && hi < effectiveCurIdx) {
          gids.forEach(gid => { rows[gid].push(null) })
          return
        }
        if (latestSaveHourIdx === -1 && hi === effectiveCurIdx) {
          gids.forEach(gid => { rows[gid].push(residuals[gid][cat]) })
          return
        }

        const remValues: { [gid: string]: number } = {}
        gids.forEach(gid => { remValues[gid] = startValues[gid] })

        for (let step = latestSaveHourIdx; step < hi; step++) {
          const stepHour = HOURS[step]
          const stepStart = step === latestSaveHourIdx ? saveTimeMin : toMinutes(stepHour)
          const stepEnd = toMinutes(HOURS[step + 1])
          const minutes = Math.max(0, stepEnd - stepStart)
          const staffIdx = STAFF_HOURS.indexOf(stepHour)
          const staffCount = staffIdx >= 0 ? (staff[cat][staffIdx] || 0) : 0
          const processed = (staffCount * cap[cat] / 60) * minutes
          let remaining = Math.max(0, processed)
          for (const gid of gids) {
            const consume = Math.min(Math.max(0, remValues[gid]), remaining)
            remValues[gid] = Math.max(0, remValues[gid] - consume)
            remaining = Math.max(0, remaining - consume)
          }
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

  function isStaffSaved(hi: number): boolean {
    return Object.keys(savedStaff).some(hourKey => getHourIdxForTime(hourKey) === hi)
  }

  function isStaffPast(hi: number): boolean {
    return hi < lastSavedHourIdx
  }

  function catLabel(cat: string): string {
    if (cat === 'MH') return 'MH(orderlines)'
    if (cat === 'SS/FS') return 'SS/FS(orderlines)'
    return `${cat}(件)`
  }

  function catUnit(cat: string): string {
    return cat === 'MH' || cat === 'SS/FS' ? 'OL' : '件'
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
    setTimeout(() => {
      setSaved(false)
      setShowInputPopup(false)
    }, 1200)
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
    setOpenGroups({ p1: true, p2: true, p3: true })
    setResetting(false)
    setShowResetConfirm(false)
  }

  const timeline = calcTimeline()

  return (
    <main className="p-6 max-w-screen-xl mx-auto" style={{fontSize: '15px'}}>

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

      {showInputPopup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 shadow-xl w-full" style={{maxWidth: '760px'}}>
            <div className="flex items-center justify-between mb-4">
              <span className="font-medium text-base">📦 残件数入力</span>
              <button onClick={() => setShowInputPopup(false)} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>
            <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4 flex items-center gap-3">
              <span className="text-sm text-gray-500">🕐 現在時刻</span>
              <input
                type="text"
                placeholder="HH:MM"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium w-24 text-center"
                value={manualTime ?? currentTime}
                onChange={e => setManualTime(e.target.value)}
              />
              {manualTime !== null && (
                <button onClick={() => setManualTime(null)} className="text-xs text-blue-500 underline ml-auto">現在時刻に戻す</button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {GROUPS.map(g => (
                <div key={g.id}>
                  <div className={`text-sm font-medium px-2 py-1 rounded mb-2 text-center ${g.headerBg} ${g.text}`}>{g.label}</div>
                  {CATS.map(cat => (
                    <div key={cat} className="mb-2">
                      <div className="text-xs text-gray-500 mb-1">{catLabel(cat)}</div>
                      <input
                        type="number" min={0}
                        className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
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
            <button onClick={handleSave} className="w-full bg-blue-600 text-white text-sm py-2.5 rounded-lg hover:bg-blue-700">
              {saving ? '保存中...' : saved ? '✓ 保存しました' : '💾 保存'}
            </button>
          </div>
        </div>
      )}

      {/* ① 上段1行：タイトル・推定能力・入力ボタン+リセット（2:3:2） */}
      <div className="grid gap-3 mb-4 items-stretch" style={{gridTemplateColumns: '2fr 3fr 2fr'}}>
        {/* タイトル */}
        <div className="flex items-center">
          <h1 className="text-2xl font-medium">Parcel Workload</h1>
        </div>

        {/* 推定能力 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-2">⚡ 推定能力</div>
          <div className="grid grid-cols-5 gap-2">
            {CATS.map(cat => (
              <div key={cat} className="text-center">
                <div className="text-xs text-gray-400 mb-1">{cat === 'MH' || cat === 'SS/FS' ? `${cat}(OL)` : `${cat}(件)`}</div>
                <input
                  type="number" min={1}
                  className="w-full border border-gray-200 rounded-lg px-1 py-1.5 text-sm text-center"
                  value={cap[cat]}
                  onChange={e => setCap(prev => ({ ...prev, [cat]: parseInt(e.target.value) || 1 }))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* 入力ボタン + リセット */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setShowInputPopup(true)}
            className="bg-blue-600 text-white text-base py-3 rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 flex-1"
          >
            📦 残件数を入力
          </button>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="text-sm text-red-400 border border-red-100 py-1.5 rounded-lg hover:bg-red-50"
          >
            🔄 リセット
          </button>
        </div>
      </div>

      {/* 推移テーブル */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3" style={{borderRadius: '12px'}}>
        <div className="font-medium text-base mb-1">時間別推移テーブル</div>
        <div className="text-xs mb-3">
          <span className="text-gray-700">黒字＝保存済み</span>
          <span className="text-blue-500 ml-2">青字＝予測</span>
        </div>
        <div style={{overflowX: 'auto'}}>
          <table className="w-full border-collapse" style={{tableLayout: 'fixed', fontSize: '13px', borderRadius: '8px', overflow: 'hidden'}}>
            <thead>
              <tr style={{borderBottom: '1px solid #e5e7eb'}}>
                <th className="text-left py-2 px-1 text-gray-400 font-normal" style={{width: '80px'}}></th>
                {HOURS.map((h, i) => (
                  <th key={h} className={`py-1 px-0 text-center font-normal text-sm ${i === effectiveCurIdx ? 'bg-blue-100 text-blue-700' : 'text-gray-400'}`} style={{width: '62px', borderLeft: '1px solid #f0f0f0'}}>
                    <div>{h}</div>
                    {/* ② 保存時刻は黒太字 */}
                    {savedTimes[h] && <div className="text-xs font-bold text-gray-700">{savedTimes[h]}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map(g => (
                <>
                  <tr
                    key={`${g.id}-header`}
                    className={`${g.headerBg} cursor-pointer`}
                    style={{borderTop: '1px solid #e5e7eb'}}
                    onClick={() => setOpenGroups(prev => ({ ...prev, [g.id]: !prev[g.id] }))}
                  >
                    <td colSpan={HOURS.length + 1} className={`py-2 px-2 font-medium text-sm ${g.text}`}>
                      {openGroups[g.id] ? '▼' : '▶'} {g.label}
                    </td>
                  </tr>
                  {openGroups[g.id] && CATS.map(cat => (
                    <tr key={`${g.id}-${cat}`} className={g.rowbg} style={{borderBottom: '1px solid #f3f4f6'}}>
                      <td className={`py-2 px-1 font-medium text-sm whitespace-nowrap ${g.text}`} style={{width: '80px', borderRight: '1px solid #f0f0f0'}}>
                        <span style={{display: 'inline-block', width: '28px'}}></span>
                        <span>{cat}</span>
                      </td>
                      {timeline[g.id][cat].map((val, i) => (
                        <td key={i} className={`py-1 px-1 text-center ${i === effectiveCurIdx ? 'bg-blue-50' : ''}`} style={{fontSize: '15px', borderLeft: '1px solid #f3f4f6'}}>
                          {val === null ? '' : (
                            <span className={
                              val === 0 ? 'text-green-600 font-semibold'
                              : isSavedCell(i) ? 'text-gray-700 font-semibold'
                              : 'text-blue-500 font-medium'
                            }>
                              {val}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 人員配置 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4" style={{borderRadius: '12px'}}>
        <div className="font-medium text-base mb-3">人員配置</div>
        <div style={{overflowX: 'auto'}}>
          <table className="w-full border-collapse" style={{tableLayout: 'fixed', fontSize: '13px'}}>
            <thead>
              <tr style={{borderBottom: '1px solid #e5e7eb'}}>
                <th className="text-left py-2 px-1 text-gray-400 font-normal" style={{width: '80px'}}></th>
                {STAFF_HOURS.map((h, i) => (
                  <th key={h} className={`py-2 px-0 text-center font-normal text-sm ${i === effectiveCurIdx ? 'bg-blue-100 text-blue-700' : 'text-gray-400'}`} style={{width: '62px', borderLeft: '1px solid #f0f0f0'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATS.map(cat => (
                <tr key={cat} style={{borderBottom: '1px solid #f3f4f6'}}>
                  <td className="py-2 px-1 font-medium text-sm text-gray-600 whitespace-nowrap" style={{width: '80px', borderRight: '1px solid #f0f0f0'}}>{cat}</td>
                  {staff[cat].map((val, hi) => {
                    const isPast = isStaffPast(hi)
                    const isSaved = isStaffSaved(hi)
                    const isLast = hi === HOURS.length - 1
                    return (
                      <td key={hi} className={`py-1 px-1 text-center ${hi === effectiveCurIdx ? 'bg-blue-50' : ''}`} style={{borderLeft: '1px solid #f3f4f6'}}>
                        {isLast ? (
                          <span className="text-gray-200">—</span>
                        ) : isPast && !isSaved ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <input
                            type="number" min={0} max={99}
                            disabled={isPast}
                            className={`w-full border rounded px-1 py-1.5 text-center font-medium
                              ${isPast ? 'bg-gray-50 border-gray-100 text-gray-700' :
                                isSaved ? 'border-gray-200 text-gray-700' :
                                hi === effectiveCurIdx ? 'border-blue-300 bg-blue-50 text-blue-500' :
                                'border-gray-200 text-blue-500'}
                            `}
                            value={val}
                            style={{fontSize: '15px'}}
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
    </main>
  )
}
