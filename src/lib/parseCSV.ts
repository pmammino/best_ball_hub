import Papa from 'papaparse'
import { RawRow } from './types'

export async function parseCSVFromText(text: string): Promise<RawRow[]> {
  const result = Papa.parse<RawRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })
  return result.data.filter((row) => row['Draft Entry'] && row['Appearance'])
}

export async function parseCSVFromFile(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        resolve(result.data.filter((row) => row['Draft Entry'] && row['Appearance']))
      },
      error: reject,
    })
  })
}
