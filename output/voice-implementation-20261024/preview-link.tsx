import {forwardRef} from 'react'
export default forwardRef<HTMLAnchorElement,any>(function Link({href,prefetch,replace,scroll,...props},ref){return <a ref={ref} href={href} {...props}/>})
