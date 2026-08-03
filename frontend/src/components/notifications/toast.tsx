import { useEffect, useRef, useState } from 'react';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import { GridLoader } from 'react-spinners';
import Check from '../../icons/check.svg';
import Close from '../../icons/close.svg';
import Warning from '../../icons/warning.svg';
import { useAppState } from '../../state';
import { Job } from '../../types';
import './toast.css';


const Progressbar = ({success}: {success: boolean}) => {
    const [val, setVal] = useState(0)
    const color = success ? "#3cef8e" : "#e5595f"

    useEffect(() => setVal(100), [])

    return (
        <>
            <CircularProgressbar
                value={val}
                styles={buildStyles({
                    rotation: 0.25,
                    strokeLinecap: 'butt',
                    pathTransitionDuration: 1,                            
                    pathColor: color,
                })}
            />
            {success ?
                <img className='toast-progress-inner toast-progress-smaller' src={Check} alt='Y' /> :
                <img className='toast-progress-inner' src={Warning} alt='N' />
            }
        </>  
    )
}


const Toast = ({job}: {job: Job}) => {
    const pending = job.status === 'pending'
    const loading = job.status === 'running' || pending
    
    return (
        <div className='toast-root'>
            <div className='toast-content'>
                <span className='toast-content-label'>Job Name: </span>
                <span className='toast-content-value'>{job.name}</span>
                <span className='toast-content-label'>Time Elapsed: </span>
                <span className='toast-content-value'>00:00:00</span>
            </div>
            <div className='toast-progress'>
                {loading ?
                    <GridLoader 
                        color={pending ? '#555' : '#684e96'}
                        loading={loading}
                        size={4}
                        speedMultiplier={0.5}
                    /> :
                    <Progressbar success={job.status === 'complete'} />
                }
            </div>
            <button className='toast-close'>
                <img className='toast-close-img' src={Close} alt='close' />
            </button>
        </div>
    )
}

const ToastContainer = () => {
    const state = useAppState()
    const [dismissed, setDismissed] = useState<Set<string>>(new Set())
    const timers = useRef<Record<string, number>>({})

    useEffect(() => {
        state.jobs.forEach((job) => {
        if ((job.status === 'complete' || job.status === 'error') && !timers.current[job.id]) {
                timers.current[job.id] = window.setTimeout(() => {
                setDismissed((prev) => new Set(prev).add(job.id))
            }, 5000)
        }
        })
    }, [state.jobs])

    const visible = state.jobs.filter((j) => !dismissed.has(j.id)).slice(0, 6)
    if (visible.length === 0)
        return null

    return (
        <div className='toast-container'>
            {visible.map(j => <Toast key={j.id}job={j}/>)}
        </div>
    )
}

export default ToastContainer
