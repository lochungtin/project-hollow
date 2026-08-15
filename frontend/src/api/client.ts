import { Dataset, HTTPPayload, ResponseMesh, ResponseMeshDMap, ResponseSlice, ResultStore, Vec3D } from "../types"

/** Fetches both slots' currently-loaded datasets, if any, from server-side storage. */
export const rehydrateDatasetAPI = (): Promise<{"A": Dataset | null, "B": Dataset | null}> => _get('api/dataset/all')

/** Fetches the currently-cached GUAVA result store (bsd/disp/sepd/divh/sepdn). */
export const rehydrateResultsAPI = (): Promise<ResultStore> => _get('api/guava/results')

/** Fetches the compute device (cuda/cpu) GUAVA operations are running on. */
export const getDeviceAPI = (): Promise<string> => _get('api/guava/device')

/** Uploads a DICOM series into the given slot. */
export const uploadDicomAPI = (slot: string, files: FileList | File[]): Promise<Dataset> => {
    const body = new FormData()
    Array.from(files).forEach((f) => body.append('files', f))
    return _post(`api/dataset/${slot}/dicom`, body)
}

/** Uploads an RTSTRUCT file into the given slot. */
export const uploadRTStructAPI = (slot: string, file: File): Promise<Dataset> => {
    const body = new FormData()
    body.append('file', file)
    return _post(`api/dataset/${slot}/rtstruct`, body)
}

/** Deletes the dataset loaded in the given slot. */
export const deleteDatasetAPI = (slot: string) => _del(`api/dataset/${slot}`)

/** Toggles visibility of a scan or a single contour (when `id` is given) in a slot. */
export const updateVisibilityAPI = (slot: string, type: string, visible: boolean, id?: string) => {
    const payload = {"visibility": visible}
    if (id)
        return _put(`/api/dataset/${slot}/${type}/${id}/visibility`, payload)
    return _put(`/api/dataset/${slot}/${type}/visibility`, payload)
}

/** Fetches a cardinal-axis scan slice. */
export const getOrthogonal = (slot: string, ax: string, idx: number): Promise<ResponseSlice> =>
    _get(`/api/dataset/${slot}/slice/${ax}/${idx}`)

/** Fetches a freeform-plane scan slice, interpolated along `normal` through the dataset's anchor. */
export const getArbitrarySlice = (slot: string, normal: Vec3D, idx: number): Promise<ResponseSlice> =>
    _get(`/api/dataset/${slot}/slice/arbitrary/${idx}?nx=${normal[0]}&ny=${normal[1]}&nz=${normal[2]}`)

/** Fetches a contour's 3D mesh. */
export const getContour = (slot: string, id: string): Promise<ResponseMesh> =>
    _get(`/api/dataset/${slot}/contour/${id}`)

/** Fetches a contour's 2D cross-section at a cardinal-axis slice (slice-overlay mode). */
export const getContourSlice = (slot: string, id: string, ax: string, idx: number): Promise<ResponseSlice> =>
    _get(`/api/dataset/${slot}/contour/${id}/slice/${ax}/${idx}`)

/** Fetches a contour's 2D cross-section at a freeform-plane slice (slice-overlay mode). */
export const getArbitraryContourSlice = (slot: string, id: string, normal: Vec3D, idx: number): Promise<ResponseSlice> =>
    _get(`/api/dataset/${slot}/contour/${id}/slice/arbitrary/${idx}?nx=${normal[0]}&ny=${normal[1]}&nz=${normal[2]}`)

/** Fetches a contour's 3D mesh, colored by the current target's distance map (DMap mode). */
export const getContourDMap = (slot: string, id: string): Promise<ResponseMeshDMap> =>
    _get(`/api/dataset/${slot}/contour/${id}/dmap/mesh`)

/** Fetches a contour's 2D cross-section at a cardinal-axis slice, colored by the target's distance map (DMap mode). */
export const getContourDMapSlice = (slot: string, id: string, ax: string, idx: number): Promise<ResponseSlice> =>
    _get(`/api/dataset/${slot}/contour/${id}/dmap/slice/${ax}/${idx}`)

/** Fetches a contour's 2D cross-section at a freeform-plane slice, colored by the target's distance map (DMap mode). */
export const getArbitraryContourDMapSlice = (slot: string, id: string, normal: Vec3D, idx: number): Promise<ResponseSlice> =>
    _get(`/api/dataset/${slot}/contour/${id}/dmap/slice/arbitrary/${idx}?nx=${normal[0]}&ny=${normal[1]}&nz=${normal[2]}`)

/** Fetches a contour's nearside surface mesh. */
export const getNearside = (slot: string, id: string): Promise<ResponseMesh> =>
    _get(`/api/dataset/${slot}/nearside/${id}`)

/**
 * Sets the point (absolute patient-space mm) pinned to the dataset's local origin.
 * Resets alignment to zero server-side so that point lands exactly on world origin.
 */
export const updateAnchorAPI = (slot: string, anchor: number[], id: string): Promise<Dataset> => {
    const payload = {"x": anchor[0], "y": anchor[1], "z": anchor[2], "id": id}
    return _put(`/api/dataset/${slot}/anchor`, payload)
}

/** Manually translates the dataset relative to world origin (mm). */
export const updateAlignmentAPI = (slot: string, alignment: number[]): Promise<Dataset> => {
    const payload = {"x": alignment[0], "y": alignment[1], "z": alignment[2]}
    return _put(`/api/dataset/${slot}/alignment`, payload)
}

/** Sets which contour is the dataset's GUAVA target. */
export const updateTargetAPI = (slot: string, target: string): Promise<Dataset> => {
    const payload = {"id": target}
    return _put(`/api/dataset/${slot}/target`, payload)
}

/** Queues a named GUAVA operation (bsd/disp/sepd/divh/sepdn) as a background job. */
export const triggerGuavaOpAPI = (op: string) => _get(`api/guava/queue/${op}`)

/** Fetches a single ROI's DiVH result. */
export const getDiVHAPI = (roi: string) => _get(`api/guava/results/divh/${roi}`)

/** Runs a fetch call and normalizes non-ok responses into thrown errors. */
const _baseApi = async(path: string, header?: RequestInit) => {
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

/** Issues a GET request. */
const _get = async (path: string) => _baseApi(path)

/** Issues a POST request with a raw body (e.g. FormData). */
const _post = async (path: string, body: BodyInit) => _baseApi(
    path,
    {
        method: 'POST',
        body: body
    }
)

/** Issues a PUT request with a JSON-serialized body. */
const _put = async (path: string, body: HTTPPayload) => _baseApi(
    path,
    {
        headers: {'Content-Type': 'application/json'},
        method: 'PUT',
        body: JSON.stringify(body),
    }
)

/** Issues a DELETE request. */
const _del = async (path: string) => _baseApi(
    path,
    {
        method: 'DELETE',
    }
)
