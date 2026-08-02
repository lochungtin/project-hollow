export type HTTPPayload = {
    [key: string]: any
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

