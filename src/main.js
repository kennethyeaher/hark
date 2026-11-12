// entry point: load global styles, then hand the page to the app shell
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import { mountApp } from './app/app.js'

mountApp(document.querySelector('#app'))
