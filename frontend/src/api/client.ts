import { Dataset, HTTPPayload } from "../types"

// --- EXPOSED APIS
// rehydrate cached data
export const rehydrateAPI = (): Promise<{"A": Dataset | null, "B": Dataset | null}> => _get('api/dataset/all')

// get computation device
export const getDeviceAPI = (): Promise<string> => _get('api/guava/device')

// dicom dataset handling
export const uploadDicomAPI = (slot: string, files: FileList | File[]): Promise<Dataset> => {
    const body = new FormData()
    Array.from(files).forEach((f) => body.append('files', f))
    return _post(`api/dataset/${slot}/dicom`, body)
}

export const uploadRTStructAPI = (slot: string, file: File): Promise<Dataset> => {
    const body = new FormData()
    body.append('file', file)
    return _post(`api/dataset/${slot}/rtstruct`, body)
}

export const deleteDatasetAPI = (slot: string) => _del(`api/dataset/${slot}`)

// render handling
export const updateVisibilityAPI = (slot: string, type: string, visible: boolean, id?: string) => {
    const payload = {"visibility": visible}
    if (id)
        return _put(`/api/dataset/${slot}/${type}/${id}/visibility`, payload)
    return _put(`/api/dataset/${slot}/${type}/visibility`, payload)
}

// target and anchor handling
export const updateAnchorAPI = (slot: string, anchor: number[], id: string): Promise<Dataset> => {
    const payload = {"x": anchor[0], "y": anchor[1], "z": anchor[2], "id": id}
    return _put(`/api/dataset/${slot}/anchor`, payload)
}

export const updateTargetAPI = (slot: string, target: string): Promise<Dataset> => {
    const payload = {"id": target}
    return _put(`/api/dataset/${slot}/target`, payload)
}

// guava operation triggers
export const triggerBSDAPI = () => _get('api/guava/queue/bsd')

export const triggerDispAPI = () => _get('api/guava/queue/disp')

export const triggerSepDAPI = () => _get('api/guava/queue/sepd')

export const triggerSepDNAPI = () => _get('api/guava/queue/sepdn')


// --- BASE METHODS
const _base_api = async(path: string, header?: RequestInit) => {
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

const _post = async (path: string, body: BodyInit) => _base_api(
    path,
    {
        method: 'POST',
        body: body
    }
)

const _put = async (path: string, body: HTTPPayload) => _base_api(
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
