import { collection, entity } from '../src'

const categories = collection([{ id: 'tools', name: 'Tools' }])
const rows = [{ sku: 'drill', details: { category: { id: 'tools' }, brand: 'Makita' } }]
const products = collection(
  rows,
  (context) =>
    entity({
      get caption() {
        return context.meta.label.toUpperCase()
      },
      get category() {
        return context.relations.categories.get(context._current.details.category.id)
      },
    }),
  {
    cacheBy: {
      sku: { unique: true },
      'details.category.id': {},
      brand: (row) => row.details.brand,
    },
    relations: { categories },
    config: { limit: 10 },
    meta: { label: 'Products' },
    methods: {
      limit() {
        return this.config.limit
      },
    },
  }
)

products.limit().toFixed()
products.meta.label.toUpperCase()
products.require('drill').caption.toUpperCase()
products.getBy('sku', 'drill')?.category?.name.toUpperCase()
products.getBy('details.category.id', 'tools').findBy('details.brand', 'Makita')
products.getBy('brand', 'Makita')
// @ts-expect-error Index must be declared.
products.getBy('missing', 'value')
// @ts-expect-error SKU is a string.
products.getBy('sku', 1)

// @ts-expect-error Field indexes are addressed by the declared path.
products.getBy('categoryId', 'tools')
