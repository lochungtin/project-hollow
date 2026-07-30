const get = async (path: string) => {
    const res = await fetch(path)
    
    if (!res.ok) {
        let detail = res.statusText
        try {
            const body = await res.json()
            detail = body.detail ? JSON.stringify(body.detail) : JSON.stringify(body)
        } catch {
            /* response wasn't JSON; keep statusText */
        }
        throw new Error(`${res.status}: ${detail}`)
    }

    if (res.status === 204)
        return undefined
    return res.json()
}

const put = async (path: string) => {

}

const post = async (path: string) => {

}

export const getDevice = () => get('api/device')