import * as THREE from 'three'
import { ResponseMesh } from '../types'
import { toWorld } from './coords'


/** Builds a `BufferGeometry` from a backend mesh response, routing vertices through `toWorld`, with optional baked per-vertex colors (DMap mode). */
export function bufferGeom(mesh: ResponseMesh, colors?: number[]): THREE.BufferGeometry {
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

	if (colors) {
		const colorAttr = new Float32Array(colors.length)
		for (let i = 0; i < colors.length; i++)
			colorAttr[i] = colors[i] / 255
		geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3))
	}

	return geometry
}

/** Renders a contour as an opaque, front-facing surface mesh. */
export const renderFull = (
	mesh: ResponseMesh,
	color: [number, number, number],
	opacity: number,
	vertexColors?: number[]
): THREE.Mesh  => {
	const geometry = bufferGeom(mesh, vertexColors)
	const material = new THREE.MeshStandardMaterial({
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

/** Renders a contour as a transparent, double-sided, depth-write-off surface mesh. */
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
