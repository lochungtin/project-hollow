const get = async (path: string) => {
    const res = await fetch(path)
    
    if (!res.ok) {
        let detail = res.statusText
        try {
            const body = await res.json()
            detail = body.detail ? JSON.stringify(body.detail) : JSON.stringify(body)
        } catch {}
        throw new Error(`${res.status}: ${detail}`)
    }

    if (res.status === 204)
        return undefined
    return res.json()
}

const put = async (path: string) => {

}

const post = async (path: string, body: any) => {
    const res = await fetch(path, { method: 'POST', body: body })

    if (!res.ok) {
        let detail = res.statusText
        try {
            const body = await res.json()
            detail = body.detail ? JSON.stringify(body.detail) : JSON.stringify(body)
        } catch (err) {
            console.error(err)
        }
        throw new Error(`${res.status}: ${detail}`)
    }

    if (res.status === 204)
        return undefined

    return res.json()
}

export const getDeviceAPI = () => get('api/device')

export const uploadDicomAPI = (slot: string, files: FileList | File[]) => {
    const body = new FormData()    
    Array.from(files).forEach((f) => body.append('files', f))
    return post(`api/${slot}/dicom`, body)
}