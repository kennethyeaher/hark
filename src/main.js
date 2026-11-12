// entry point: load global styles, then hand the page to the app shell
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/sidebar.css'
import './styles/topbar.css'
import './styles/components.css'
import './styles/pages.css'
import { mountApp } from './app/app.js'
import { sampleCourses, buildSampleRecordings } from './data/sample.js'

// sample data stands in for the indexeddb store until milestone 2
mountApp(document.querySelector('#app'), {
  courses: sampleCourses,
  recordings: buildSampleRecordings(),
})
