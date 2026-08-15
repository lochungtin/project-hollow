import * as THREE from 'three'

export type Vec3D = [number, number, number]

export type HTTPPayload = { [key: string]: any }

export type AppState = {
    'device': string,
    
    'activeSlot': string,
    'setActiveSlot': (slot: string) => void,

    'uploading': { [key: string]: boolean },
    'dataset': { [key: string]: Dataset | null },

    'uploadDicom': (slot: string, files: File[] | FileList) => Promise<void>,
    'uploadRTStruct': (slot: string, file: File) => Promise<void>,
    'deleteDataset': (slot: string) => Promise<void>,

    'updateVisibility': (slot: string, type: string, visible: boolean, id?: string) => Promise<void>,

    'localAnchorMM': { [key: string]: number[] },
    'localAnchorPX': { [key: string]: number[] },

    'updateAnchor': (slot: string, anchor: number[], id?: string) => Promise<void>,
    'updateAlignment': (slot: string, alignment: number[]) => Promise<void>,
    'updateLocalAnchorMM': (slot: string, anchor: number[]) => void,
    'updateLocalAnchorPX': (slot: string, anchor: number[]) => void,

    'updateTarget': (slot: string, target: string) => Promise<void>,

    'selected': SelectedContour[],
    'toggleContourSelect': (slot: string, id: string) => void,

    'jobs': Job[],
    'removeJob': (job: Job) => void,

    'results': ResultStore,
    'trigger': (op: string) => Promise<void>,
    
    'getDiVH': (roi: string) => Promise<void>,
    'divh': ResponseDiVHSingle,
}


export type Dataset = {
    'slot': 'A' | 'B',
    'scan': Scan,
    'targetID': string,
    'anchorID': string,
    'anchor': Vec3D,
    'alignment': Vec3D,
    'render': {
        'rotation': Vec3D,
    },
    'contours': {
        [key: string]: Contour
    },
}

export type Scan = {
    'id': string,
    'shape': Vec3D,
    'spacing': Vec3D,
    'origin': Vec3D,
    'modality': string,
    'range': number[],
    'visible': boolean,
}

export type Contour = {
    'id': string,
    'name': string,
    'number': string,
    'color': Vec3D
    'visible': boolean,
    'has_mesh': boolean,
    'volume': number,
    'surface_area': number,
    'center_of_mass': Vec3D,
}

export type Mesh = {
    'vertices': number[],
    'faces': number[],
    'vertex_count': number,
    'face_count': number
}


export type ResponseQueue = 
    {'type': 'list', 'jobs': Job[]} | 
    {'type': 'update', 'job': Job}

export type Listener = (msg: ResponseQueue) => void

export type Job = {
    'id': string,
    'name': string,
    'type': 'bsd' | 'disp' | 'sepd' | 'divh' | 'sepdn',
    'status': string,
    't_sta': number,
    't_fin': number,
    'result': any,
    'error': string,
}


export type ResultStore = {
    'bsd': ResponseBSD | {},
    'disp': ResponseDisp | {},
    'sepd': ResponseSepD | {},
    'divh': ResponseDiVH | [],
    'sepdn': ResponseSepDN | {},
}

export type ResponseBSD = { 
    [key: string]: { 'ASD': number, 'HD95': number, 'HD': number } 
}

export type ResponseDisp = {
    [key: string]: number[]
}

export type ResponseSepD = {
    [key: string]: number[][]
}

export type ResponseDiVH = string[]

export type ResponseDiVHSingle = {
    [key: string]: number[]
}

export type ResponseSepDN = {
    [key: string]: number[][]
}


export type ResponseSlice = {
    'url': string,
    'center': Vec3D,
    'dU': Vec3D,
    'dV': Vec3D,
    'width': number,
    'height': number,
}

export type Axis = 'axial' | 'coronal' | 'sagittal'
// arbitrary: a freeform plane whose normal comes from two selected contours' centers of
// mass, not a fixed lookup like the cardinal axes — kept out of `Axis` so AXIS_DU/AXIS_DV
// (scene/scan.ts) don't need a meaningless static entry for it
export type SliceMode = Axis | 'arbitrary'

export type VisDataset = {
    'inner': THREE.Group,
    'outer': THREE.Group,
    'anchor': Vec3D,
    'outs': { [key: string]: THREE.Object3D },
    'slices': { [key: string]: THREE.Object3D },
    // contour slice-overlay mode ("M" key): each visible contour's overlay plane
    // ('contour:{id}') — kept separate from `slices` so setScanVisibility's sweep over the
    // scan plane doesn't also hide/show these
    'overlays': { [key: string]: THREE.Object3D },
    'axes': THREE.Object3D | null,
}

export type SliceState = {
    'mode': SliceMode,
    'idx': { [key: string]: number },
    'anchor': Vec3D,
    'normal': Vec3D,
}

export type SelectedContour = { 'slot': string, 'id': string }


export type ResponseMesh = {
    'id': string,
    'name': string,
    'number': string,
    'color': number[]
    'visible': boolean,
    'has_mesh': boolean,
    'volume': number,
    'surface_area': number,
    'center_of_mass': Vec3D,
    'vertices': number[],
    'faces': number[],
    'vertex_count': number,
    'face_count': number,
}