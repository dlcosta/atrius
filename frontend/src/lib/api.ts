export const apiUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? ''}${path}`
