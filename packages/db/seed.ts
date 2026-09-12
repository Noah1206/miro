import { seedOfficials } from './src/seed/run'

await seedOfficials()
console.log('seeded official characters')
process.exit(0)
