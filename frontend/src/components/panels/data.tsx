import './data.css'


const TabularCard = ({title} : {title: string}) => {
    return (
        <section>
            <span>{title}</span>
        </section>
    )
}

const DataPane = () => {
    return (
        <aside className='data-pane'>
            <TabularCard title="Volume" />
            <TabularCard title="Surface Area" />
            <TabularCard title="Surface Discrepancy" />
        </aside>
    )
}

export default DataPane