type ToastType = 'error' | 'warning' | 'info' | 'success'

interface ToastOptions {
    message: string
    type: ToastType
    duration?: number
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
    error: 6000,
    info: 4000,
    success: 3000,
    warning: 5000,
}

const TOAST_STYLES: Record<ToastType, string> = {
    error: 'bg-red-600 text-white',
    info: 'bg-sky-600 text-white',
    success: 'bg-green-600 text-white',
    warning: 'bg-amber-600 text-white',
}

let toastContainer: HTMLDivElement | null = null

function getOrCreateContainer(): HTMLDivElement {
    if (toastContainer) return toastContainer

    const existing = document.getElementById('toast-container')
    if (existing) {
        toastContainer = existing as HTMLDivElement
        return toastContainer
    }

    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    toastContainer.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2'
    toastContainer.setAttribute('aria-live', 'polite')
    document.body.appendChild(toastContainer)
    return toastContainer
}

export function showToast(options: ToastOptions): void {
    const container = getOrCreateContainer()
    const duration = options.duration ?? DEFAULT_DURATIONS[options.type]

    const toast = document.createElement('div')
    toast.className = `px-4 py-3 rounded-lg shadow-lg max-w-sm flex items-center gap-3 cursor-pointer transition-all duration-300 opacity-0 translate-x-4 ${TOAST_STYLES[options.type]}`
    toast.setAttribute('role', 'alert')

    const messageSpan = document.createElement('span')
    messageSpan.className = 'flex-1 text-sm'
    messageSpan.textContent = options.message
    toast.appendChild(messageSpan)

    const closeButton = document.createElement('button')
    closeButton.className =
        'ml-2 text-white/80 hover:text-white text-lg leading-none font-bold'
    closeButton.innerHTML = '&times;'
    closeButton.setAttribute('aria-label', 'Close')
    toast.appendChild(closeButton)

    let dismissed = false
    const removeToast = () => {
        if (dismissed) return
        dismissed = true
        toast.classList.add('opacity-0', 'translate-x-4')
        setTimeout(() => {
            toast.remove()
        }, 300)
    }

    closeButton.addEventListener('click', (e) => {
        e.stopPropagation()
        removeToast()
    })
    toast.addEventListener('click', removeToast)

    container.insertBefore(toast, container.firstChild)

    requestAnimationFrame(() => {
        toast.classList.remove('opacity-0', 'translate-x-4')
    })

    if (duration > 0) {
        setTimeout(removeToast, duration)
    }
}
