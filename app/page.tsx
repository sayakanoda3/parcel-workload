'use client'

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00']
const CATS = ['MH', 'SS/FS', 'Pack']
const GROUPS = [
  { id: 'p1', label: '+1', bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700' },
  { id: 'p2', label: '+2', bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700' },
  { id: 'p3', label: '+3', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
]

type Residuals = { [gid: string]: { [cat: string]: number } }
type Staff = { [cat: string]: number[] }

const defaultResiduals: Residuals = {
  p1: { MH: 0, 'SS/FS': 0, Pack: 50 },
  p2: { MH: 200, 'SS/FS': 50, Pack: 300 },
  p3: { MH: 150, 'SS/FS': 30, Pack: 200 },
}

const defaultStaff: Staff = {
  MH:       [2,6,6,6,6,6,6,3,3,3,3,1,1],
  'SS/FS':  [0,2,2,2,2,2,2,1,1,1,1,1,1],
  Pack:     [0,7,7,7,7,7,7,7,7,7,7,3,3],
}

const defaultCap: { [cat: string]: number } = { MH: 40, 'SS/FS': 30, Pack: 7 }

export default function Home() {
  const [curTime, setCurTime] = useState('08:00')
  const [cap, setCap] = useState(defaultCap)
  const [residuals, setResiduals] = useState<Residuals>(defaultResiduals)
  const [staff, setStaff] = useState<Staff>(defaultStaff)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const curIdx = HOURS.indexOf(curTime)

  function calcTimeline() {
    const result: { [gid: string]: { [cat: string]: number[] } } = {}
    GROUPS.forEach(g => {
      result[g.id] = {}
      CATS.forEach(cat => {
        let rem = residuals[g.id][cat]
        const row: number[] = []
        HOURS.forEach((_, hi) => {
          row.push(Math.max(0, Math.round(rem)))
          if (hi >= curIdx) {
            const s = staff[cat][Math.min(hi, staff[cat].length - 1)] || 0
            rem = Math.max(0, rem - s * cap[cat])
          }
        })
        result[g.id][cat] = row
      })
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

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const timeline = calcTimeline()

  return (
    <main className="p-6 max-w-screen-xl mx-auto">
      <h1 className="text-2xl font-medium mb-6">Parcel Workload</h1>

      {/* 上部コントロール */}
      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="bg-white border border-gray-200 rounded-xl p-4 min-w-48">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">🕐 現在時刻</div>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            value={curTime}
            onChange={e => setCurTime(e.target.value)}
          >
            {HOURS.slice(0, -1).map(h => <option key={h}>{h}</option>)}
          </select>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1 min-w-64">
          <div className="text-xs text-gray-500 mb-2 flex items-center gap-1">⚡ 推定能力（件/時間）</div>
          <div className="flex gap-4">
            {CATS.map(cat => (
              <div key={cat}>
                <div className="text-xs text-gray-400 mb-1">{cat}</div>
                <input
                  type="number" min={1}
                  className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center"
                  value={cap[cat]}
                  onChange={e => setCap(prev => ({ ...prev, [cat]: parseInt(e.target.value) || 1 }))}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {GROUPS.map(g => (
          <div key={g.id} className={`rounded-xl border-2 p-4 ${g.bg} ${g.border}`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`font-medium ${g.text}`}>{g.label}</span>
              <div className="flex items-center gap-1">
                {CATS.every(cat => getCompletionTime(timeline, g.id, cat) !== 'Tomorrow')
                  ? <span className="text-green-500 text-lg">✓</span>
                  : <span className="text-yellow-500 text-lg">🕐</span>}
                <span className={`text-sm font-medium ${g.text}`}>
                  {CATS.map(cat => getCompletionTime(timeline, g.id, cat)).reduce((a, b) => {
                    if (a === 'Tomorrow' || b === 'Tomorrow') return 'Tomorrow'
                    return a > b ? a : b
                  })}
                </span>
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
        ))}
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-4">
        {/* 残件数入力 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium flex items-center gap-1">📦 残件数入力</span>
            <button
              onClick={handleSave}
              className="bg-blue-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-blue-700"
            >
              {saving ? '保存中...' : saved ? '✓ 保存済み' : '💾 保存'}
            </button>
          </div>
          {GROUPS.map(g => (
            <div key={g.id} className="mb-4">
              <div className={`text-xs font-medium px-2 py-1 rounded mb-2 ${g.bg} ${g.text}`}>{g.label}</div>
              {CATS.map(cat => (
                <div key={cat} className="mb-2">
                  <div className="text-xs text-gray-500 mb-1">{cat}残件数</div>
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

        <div className="flex flex-col gap-4">
          {/* 時間別推移テーブル */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-medium mb-3">時間別推移テーブル</div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 px-2 text-gray-400 font-normal w-20"></th>
                    {HOURS.map((h, i) => (
                      <th key={h} className={`py-1.5 px-2 text-center font-normal w-12 ${i === curIdx ? 'bg-blue-100 text-blue-700 rounded' : 'text-gray-400'}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GROUPS.map(g => CATS.map(cat => (
                    <tr key={`${g.id}-${cat}`} className={g.id === 'p1' ? 'bg-red-50/50' : g.id === 'p2' ? 'bg-yellow-50/50' : 'bg-blue-50/50'}>
                      <td className={`py-1 px-2 font-medium ${g.text}`}>{g.label} {cat}</td>
                      {timeline[g.id][cat].map((val, i) => (
                        <td key={i} className={`py-1 px-2 text-center ${val === 0 ? 'text-green-600 font-medium' : 'text-gray-700'}`}>{val}</td>
                      ))}
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 人員配置 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-medium mb-3">人員配置</div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 px-2 text-gray-400 font-normal w-16"></th>
                    {HOURS.slice(0, 13).map(h => (
                      <th key={h} className="py-1.5 px-2 text-center text-gray-400 font-normal w-14">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CATS.map(cat => (
                    <tr key={cat}>
                      <td className="py-1 px-2 font-medium text-gray-600">{cat}</td>
                      {staff[cat].map((val, hi) => (
                        <td key={hi} className="py-1 px-1 text-center">
                          <input
                            type="number" min={0} max={99}
                            className="w-12 border border-gray-200 rounded px-1 py-1 text-center text-xs"
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