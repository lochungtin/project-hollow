import * as THREE from 'three'

export default class SceneManager {
    private container
    private scene

    private camera
    private cameraTarget = new THREE.Vector3(0, 0, 0)
    private cameraDistance = 400
    private cameraYaw = Math.PI / 4
    private cameraPitch = Math.PI / 6

    private renderer
    private resizeObserver

    private frameHandle = 0

    constructor(container: HTMLElement) {
        this.container = container

        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0x111111)

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000)
        this.updateCamera()

        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        container.appendChild(this.renderer.domElement)

        const hemi = new THREE.HemisphereLight(0xffffff, 0x1a1c22, 1.1)
        this.scene.add(hemi)

        const dir = new THREE.DirectionalLight(0xffffff, 0.9)
        dir.position.set(1, 1.4, 1)
        this.scene.add(dir)

        const dir2 = new THREE.DirectionalLight(0xffffff, 0.35)
        dir2.position.set(-1, -0.6, -0.8)
        this.scene.add(dir2)

        this.resizeObserver = new ResizeObserver(() => this.resize())
        this.resizeObserver.observe(container)
        this.resize()

        this.animate = this.animate.bind(this)
        this.frameHandle = requestAnimationFrame(this.animate)
    }
    

    private updateCamera() {
        const x = this.cameraTarget.x + this.cameraDistance * Math.cos(this.cameraPitch) * Math.sin(this.cameraYaw)
        const y = this.cameraTarget.y + this.cameraDistance * Math.sin(this.cameraPitch)
        const z = this.cameraTarget.z + this.cameraDistance * Math.cos(this.cameraPitch) * Math.cos(this.cameraYaw)
        this.camera.position.set(x, y, z)
        this.camera.lookAt(this.cameraTarget)
    }

    resize() {
        const w = this.container.clientWidth || 1
        const h = this.container.clientHeight || 1
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(w, h, false)
    }

    private animate() {
        this.frameHandle = requestAnimationFrame(this.animate)
        this.renderer.render(this.scene, this.camera)
    }

    dispose(): void {
        cancelAnimationFrame(this.frameHandle)
        this.resizeObserver.disconnect()
        // this.datasets.forEach((d) => disposeObject3D(d.outer))
        this.renderer.dispose()
        this.renderer.domElement.remove()
    }
}
