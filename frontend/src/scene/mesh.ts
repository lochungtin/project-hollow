import * as THREE from 'three'
import { ResponseMesh } from '../types'
import { toWorld } from './coords'


export function bufferGeom(mesh: ResponseMesh, colors?: number[]): THREE.BufferGeometry {
	// backend vertices are in raw DICOM patient space (mm) — every other object in the
	// scene (slice planes, axes, anchor math) is routed through toWorld() before being
	// handed to Three.js, so this needs the same remap or it renders in a sheared,
	// mismatched frame relative to everything else (toWorld is a proper rotation, so face
	// winding/normals stay valid without needing to reverse index order)
	const src = mesh.vertices
	const positions = new Float32Array(src.length)
	for (let i = 0; i < src.length; i += 3) {
		const [wx, wy, wz] = toWorld([src[i], src[i + 1], src[i + 2]])
		positions[i] = wx
		positions[i + 1] = wy
		positions[i + 2] = wz
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
	geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.faces), 1))
	geometry.computeVertexNormals()

	// distance-map mode ("DMap" button): per-vertex color baked server-side (see backend
	// image.py::distanceColorsFlat), 0-255 ints normalized to Three.js's expected 0-1 range
	if (colors) {
		const colorAttr = new Float32Array(colors.length)
		for (let i = 0; i < colors.length; i++)
			colorAttr[i] = colors[i] / 255
		geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3))
	}

	return geometry
}

export const renderFull = (
	mesh: ResponseMesh,
	color: [number, number, number],
	opacity: number,
	vertexColors?: number[]
): THREE.Mesh  => {
	const geometry = bufferGeom(mesh, vertexColors)
	const material = new THREE.MeshStandardMaterial({
		// vertex colors multiply the material's base color, so use white when they're
		// present to avoid tinting them with the (now-unused) flat contour color
		color: vertexColors ? new THREE.Color(1, 1, 1) : new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
		vertexColors: !!vertexColors,
		transparent: opacity < 1,
		opacity,
		side: THREE.FrontSide,
		metalness: 0.05,
		roughness: 0.55,
	})
	const m = new THREE.Mesh(geometry, material)
	m.castShadow = false
	m.receiveShadow = false
	return m
}

export const renderPartial = (
	mesh: ResponseMesh,
	color: [number, number, number],
	opacity: number,
	vertexColors?: number[]
): THREE.Mesh => {
	const geometry = bufferGeom(mesh, vertexColors)
	const material = new THREE.MeshStandardMaterial({
		color: vertexColors ? new THREE.Color(1, 1, 1) : new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
		vertexColors: !!vertexColors,
		transparent: true,
		opacity,
		side: THREE.DoubleSide,
		metalness: 0.0,
		roughness: 0.8,
		depthWrite: false,
	})
	return new THREE.Mesh(geometry, material)
}