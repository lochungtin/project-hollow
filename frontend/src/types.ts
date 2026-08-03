export type HTTPPayload = {
    [key: string]: any
}


export type AppState = {
    'device': string,
    
    'uploading': { [key: string]: boolean },
    'dataset': { [key: string]: Dataset | null },

    'uploadDicom': (slot: string, files: File[] | FileList) => Promise<void>,
    'uploadRTStruct': (slot: string, file: File) => Promise<void>,
    'deleteDataset': (slot: string) => Promise<void>,

    'updateVisibility': (slot: string, type: string, visible: boolean, id?: string) => Promise<void>,

    'localAnchorMM': { [key: string]: number[] },
    'localAnchorPX': { [key: string]: number[] },

    'updateAnchor': (slot: string, anchor: number[], id?: string) => Promise<void>,
    'updateLocalAnchorMM': (slot: string, anchor: number[]) => void,
    'updateLocalAnchorPX': (slot: string, anchor: number[]) => void,

    'updateTarget': (slot: string, target: string) => Promise<void>,

    'bsdRes': { [key: string]: {"ASD": number, "HD95": number, "HD": number} },
    'triggerBSD': () => Promise<void>,

    'dispRes': {}
    'triggerDisp': () => Promise<void>,

    'sepDRes': {},
    'triggerSepD': () => Promise<void>,

    'sepDNRes': {},
    'triggerSepDN': () => Promise<void>,
}


export type Dataset = {
    'slot': 'A' | 'B',
    'scan': Scan,
    'targetID': string,
    'anchorID': string,
    'anchor': number[],
    'alignment': number[],
    'render': {
        'rotation': number[],
    },
    'contours': {
        [key: string]: Contour
    },
}

export type Scan = {
    'id': string,
    'shape': number[],
    'spacing': number[],
    'modality': string,
    'range': number[],
    'visible': boolean,
}

export type Contour = {
    'id': string,
    'name': string,
    'number': string,
    'color': number[]
    'visible': boolean,
    'has_mesh': boolean,
    'volume': number,
    'surface_area': number,
    'center_of_mass': number[],
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
    'status': 'pending' | 'running'| 'complete' | 'error',
    't_sta': number,
    't_fin': number,
    'result': any,
    'error': string,
}