const express = require('express')
const app = express()
const port = 3000

// Typescript = https://www.digitalocean.com/community/tutorials/setting-up-a-node-project-with-typescript
// oracle https://oracle.github.io/node-oracledb/
// example https://github.com/oracle/node-oracledb/blob/master/examples/example.js#L32

app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})