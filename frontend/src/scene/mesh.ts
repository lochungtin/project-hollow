import * as THREE from 'three'
import { ResponseMesh } from '../types'
import { toWorld } from './coords'


export function bufferGeom(mesh: ResponseMesh): THREE.BufferGeometry {
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
	return geometry
}

export const renderFull = (
	mesh: ResponseMesh,
	color: [number, number, number],
	opacity: number
): THREE.Mesh  => {
	const geometry = bufferGeom(mesh)
	const material = new THREE.MeshStandardMaterial({
		color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
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
	opacity: number
): THREE.Mesh => {
	const geometry = bufferGeom(mesh)
	const material = new THREE.MeshStandardMaterial({
		color: new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255),
		transparent: true,
		opacity,
		side: THREE.DoubleSide,
		metalness: 0.0,
		roughness: 0.8,
		depthWrite: false,
	})
	return new THREE.Mesh(geometry, material)
}