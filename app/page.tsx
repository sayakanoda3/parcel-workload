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
type SavedData = { [hour: string]: { [gid: string]: { [cat: string]: number } } }

const defaultResiduals: Residuals = {
  p1: { MH: 0, 'SS/FS': 0, Pack: 50 },
  p2: { MH: 200, 'SS/FS': 50, Pack: 300 },
  p3: { MH: 150, 'SS/FS': 30, Pack: 200 },
}

const defaultStaff: Staff = {
  MH:      [2,6,6,6,6,6,6,3,3,3,3,1,1],
  'SS/FS': [0,2,2,2,2,2,2,1,1,1,1,1,1],
  Pack:    [0,6,6,6,6,6,6,6,6,3,3,3,3],
}

const defaultCap: { [cat: string]: number } = { MH: 40, 'SS/FS': 30, Pack: 7 }

export default function Home() {
  const [curTime, setCurTime] = useState('08:00')
  const [cap, setCap] = useState(defaultCap)
  const [residuals, setResiduals] = useState<Residuals>(defaultResiduals)
  const [staff, setStaff] = useState<Staff>(defaultStaff)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedData, setSavedData] = useState<SavedData>({})

  const curIdx = HOURS.indexOf(curTime)

  const loadTodayData = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('residuals')
      .select('*')
      .gte('recorded_at', `${today}T00:00:00`)
      .lte('recorded_at', `${today}T23:59:59`)
      .order('recorded_at', { ascending: true })
    if (!data || data.length === 0) return
    const byHour: SavedData = {}
    data.forEach((row: any) => {
      if (!byHour[row.shift_time]) byHour[row.shift_time] = {}
      if (!byHour[row.shift_time][row.group_id]) byHour[row.shift_time][row.group_id] = {}
      byHour[row.shift_time][row.group_id][row.category] = row.value
    })
    setSavedData(byHour)
  }, [])

  useEffect(() => { loadTodayData() }, [loadTodayData])

  function calcTimeline() {
    const result: { [gid: string]: { [cat: string]: number[] } } = {}
    const gids = ['p1', 'p2', 'p3']
    CATS.forEach(cat => {
      gids.forEach(gid => { result[gid] = result[gid] || {} })
      const remValues: { [gid: string]: number } = {}
      gids.forEach(gid => { remValues[gid] = residuals[gid][cat] })
      const rows: { [gid: string]: number[] } = { p1: [], p2: [], p3: [] }
      HOURS.forEach((_, hi) => {
        if (hi <= curIdx) {
          gids.forEach(gid => rows[gid].push(Math.max(0, Math.round(remValues[gid]))))
          return
        }
        const s = staff[cat][Math.min(hi - 1, staff[cat].length - 1)] || 0
        let remaining = s * cap[cat]
        for (const gid of gids) {
          const consume = Math.min(remValues[gid], remaining)
          remValues[gid] = Math.max(0, remValues[gid] - consume)
          remaining -= consume
          rows[gid].push(Math.max(0, Math.round(remValues[gid])))
        }
      })
      gids.forEach(gid => { result[gid][cat] = rows[gid] })
    })
    return result
  }

  function getCompletionTime(timeline: ReturnType<typeof calcTimeline>, gid: string, cat: string) {
    const row = timeline[gid][cat]
    for (let i = curIdx; i < HOURS.length; i++) {
      if (row[i] === 0) return HOURS[i]
    }
    return 'Tomorrow'
  }

  function getSummaryTime(timeline: ReturnType<typeof calcTimeline>, gid: string) {
    const times = CATS.map(cat => getCompletionTime(timeline, gid, cat))
    if (times.some(t => t === 'Tomorrow')) return 'Tomorrow'
    return times.reduce((a, b) => a > b ? a : b)
  }

  function getTimelineWithSaved(timeline: ReturnType<typeof calcTimeline>) {
    const result = JSON.parse(JSON.stringify(timeline))
    GROUPS.forEach(g => {
      CATS.forEach(cat => {
        result[g.id][cat][curIdx] = residuals[g.id][cat]
      })
    })
    for (let hi = 0; hi < curIdx; hi++) {
      const hour = HOURS[hi]
      const hasSaved = !!savedData[hour]
      GROUPS.forEach(g => {
        CATS.forEach(cat => {
          if (hasSaved && savedData[hour][g.id]?.[cat] !== undefined) {
            result[g.id][cat][hi] = savedData[hour][g.id][cat]
          } else {
            result[g.id][cat][hi] = null
          }
        })
      })
    }
    return result
  }

  async function handleSave() {
    setSaving(true)
    const rows = GROUPS.flatMap(g =>
      CATS.map(cat => ({
        shift_time: curTime,
        group_id: g.id,
        category: cat,
        value: residuals[g.id][cat],
      }))
    )
    await supabase.from('residuals').insert(rows)
    const staffRows = CATS.flatMap(cat =>
      staff[cat].map((count, hi) => ({
        category: cat,
        hour_index: hi,
        staff_count: count,
      }))
    )
    await supabase.from('staff_allocation').insert(staffRows)
    setSavedData(prev => {
      const next = { ...prev, [curTime]: {} as { [gid: string]: { [cat: string]: number } } }
      GROUPS.forEach(g => { next[curTime][g.id] = { ...residuals[g.id] } })
      return next
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const timeline = calcTimeline()
  const timelineWithSaved = getTimelineWithSaved(timeline)

  return (
    <main className="p-6 max-w-screen-xl mx-auto text-base">
      <h1 className="text-2xl font-medium mb-4">Parcel Workload</h1>

      {/* 全体2カラム：左=コントロール、右=サマリー+テーブル */}
      <div className="grid grid-cols-[280px_1fr] gap-4 items-start">

        {/* 左カラム */}
        <div className="flex flex-col gap-3">

          {/* 現在時刻 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">🕐 現在時刻</div>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              value={curTime}
              onChange={e => setCurTime(e.target.value)}
            >
              {HOURS.slice(0, -1).map(h => <option key={h}>{h}</option>)}
            </select>
          </div>

          {/* 推定能力 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-500 mb-2 flex items-center gap-1">⚡ 推定能力（件/時間）</div>
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

          {/* 残件数入力 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-base">📦 残件数入力</span>
              <button
                onClick={handleSave}
                className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700"
              >
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

        {/* 右カラム */}
        <div className="flex flex-col gap-3">

          {/* サマリーカード 3つ横並び */}
          <div className="grid grid-cols-3 gap-3">
            {GROUPS.map(g => {
              const summaryTime = getSummaryTime(timeline, g.id)
              return (
                <div key={g.id} className={`rounded-xl border-2 p-4 ${g.bg} ${g.border}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`font-medium text-sm ${g.text}`}>{g.label}</span>
                    <div className="flex items-center gap-1">
                      {summaryTime !== 'Tomorrow'
                        ? <span className="text-green-500 text-lg">✓</span>
                        : <span className="text-yellow-500">🕐</span>}
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
                  {g.id === 'p3' && (
                    <>
                      <div className="text-xs text-gray-500 mt-2 mb-1 pt-2 border-t border-blue-100">21:00時点の予測残件数</div>
                      {CATS.map(cat => (
                        <div key={cat} className="flex justify-between text-sm py-0.5">
                          <span className="text-gray-500">{cat}</span>
                          <span className={`font-medium ${timeline[g.id][cat][HOURS.length - 1] > 0 ? 'text-red-500' : 'text-green-600'}`}>
                            {timeline[g.id][cat][HOURS.length - 1]}件
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* 時間別推移テーブル */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-medium text-base mb-3">時間別推移テーブル</div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-400 font-normal w-24"></th>
                    {HOURS.map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-center font-normal w-14 ${i === curIdx ? 'bg-blue-100 text-blue-700 rounded' : 'text-gray-400'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map(g => CATS.map(cat => (
                    <tr key={`${g.id}-${cat}`} className={g.rowbg}>
                      <td className={`py-1.5 px-2 font-medium text-sm ${g.text}`}>{g.label} {cat}</td>
                      {timelineWithSaved[g.id][cat].map((val: number | null, i: number) => (
                        <td key={i} className={`py-1.5 px-2 text-center text-sm ${i === curIdx ? 'bg-blue-50 font-medium' : ''} ${val === 0 ? 'text-green-600 font-medium' : 'text-gray-700'}`}>
                          {val === null ? '' : val}
                        </td>
                      ))}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 人員配置 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-medium text-base mb-3">人員配置</div>
            <div className="overflow-x-auto">
              <table className="text-sm w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-2 px-2 text-gray-400 font-normal w-16"></th>
                    {STAFF_HOURS.map((h, i) => (
                      <th key={h} className={`py-2 px-2 text-center font-normal w-14 ${i === curIdx ? 'bg-blue-100 text-blue-700 rounded' : 'text-gray-400'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(cat => (
                    <tr key={cat}>
                      <td className="py-1.5 px-2 font-medium text-sm text-gray-600">{cat}</td>
                      {staff[cat].map((val, hi) => (
                        <td key={hi} className={`py-1 px-1 text-center ${hi === curIdx ? 'bg-blue-50' : ''}`}>
                          <input
                            type="number" min={0} max={99}
                            className={`w-12 border rounded px-1 py-1 text-center text-sm ${hi === curIdx ? 'border-blue-300 bg-blue-50' : 'border-gray-200'}`}
                            value={val}
                            onChange={e => setStaff(prev => {
                              const updated = [...prev[cat]]
                              updated[hi] = parseInt(e.target.value) || 0
                              return { ...prev, [cat]: updated }
                            })}
                          />
                        </td>
                      ))}
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