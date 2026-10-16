const databaseName = 'twofold-reports'
const recordKey = 'current'
const iterations = 310000

type EncryptedRecord = { salt: number[]; iv: number[]; ciphertext: ArrayBuffer }

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('reports')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transaction<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction('reports', mode)
    const request = operation(tx.objectStore('reports'))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => { db.close(); resolve(result) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  }))
}

async function key(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: new Uint8Array(salt), iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function saveReport(report: unknown, passphrase: string): Promise<void> {
  if (!passphrase) throw new Error('Enter a passphrase to keep this report.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(passphrase, salt), new TextEncoder().encode(JSON.stringify(report)))
  await transaction('readwrite', store => store.put({ salt: [...salt], iv: [...iv], ciphertext } satisfies EncryptedRecord, recordKey))
}

export async function hasSavedReport(): Promise<boolean> {
  return Boolean(await transaction('readonly', store => store.getKey(recordKey)))
}

export async function unlockReport<T>(passphrase: string): Promise<T> {
  const record = await transaction<EncryptedRecord | undefined>('readonly', store => store.get(recordKey))
  if (!record) throw new Error('There is no saved report on this device.')
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, await key(passphrase, new Uint8Array(record.salt)), record.ciphertext)
    return JSON.parse(new TextDecoder().decode(plaintext)) as T
  } catch { throw new Error('That passphrase could not unlock the report.') }
}

export async function forgetReport(): Promise<void> {
  await transaction('readwrite', store => store.delete(recordKey))
}
