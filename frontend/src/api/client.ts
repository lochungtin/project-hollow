// --- EXPOSED APIS
export const getDeviceAPI = () => _get('api/device')

export const uploadDicomAPI = (slot: string, files: FileList | File[]) => {
    const body = new FormData()
    Array.from(files).forEach((f) => body.append('files', f))
    return _post(`api/${slot}/dicom`, body)
}

export const uploadRTStructAPI = (slot: string, file: File) => {
    const body = new FormData()
    body.append('file', file)
    return _post(`api/${slot}/rtstruct`, body)
}

export const deleteDatasetAPI = (slot: string) => _del(`api/${slot}`)

export const updateVisibilityAPI = (slot: string, type: string, visible: boolean, id?: string) => {
    console.log(visible)
    if (id)
        return _put(`/api/${slot}/${type}/${id}/visi""bility`, visible)
    return _put(`/api/${slot}/${type}/visibility`, {"visibility": visible})
}


// --- BASE METHODS
const _base_api = async(path: string, header?: any) => {
    const res = await fetch(path, header)
    
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

const _get = async (path: string) => _base_api(path)

const _post = async (path: string, body: any) => _base_api(
    path,
    {
        method: 'POST',
        body: body
    }
)

const _put = async (path: string, body: any) => _base_api(
    path,
    {
        headers: {'Content-Type': 'application/json'},
        method: 'PUT',
        body: JSON.stringify(body),
    }
)

const _del = async (path: string) => _base_api(
    path,
    {
        method: 'DELETE',
    }
)
