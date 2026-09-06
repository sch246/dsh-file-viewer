/** @param sizeBytes Exact source bytes. @param bytesLabel Localized unit for values below 1 KiB. @returns Automatically scaled IEC file size. */
export function formatFileSize(sizeBytes: number, bytesLabel: string): string {
  const units = [bytesLabel, 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
  const tier = sizeBytes < 1024 ? 0 : Math.min(Math.floor(Math.log2(sizeBytes) / 10), units.length - 1)
  return `${(sizeBytes / 1024 ** tier).toLocaleString(undefined, { maximumFractionDigits: tier === 0 ? 0 : 2 })} ${units[tier]}`
}
