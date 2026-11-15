import catalog from '../../data/job-functions-51job.json';

export interface JobFunction {
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  subcategoryCode: string;
  subcategoryName: string;
}

export const jobFunctionGroups = catalog.groups;
export const jobFunctionSource = {
  name: catalog.source,
  url: catalog.sourceUrl,
  dictionaryUrl: catalog.dictionaryUrl,
  retrievedAt: catalog.retrievedAt,
};

const functions: JobFunction[] = jobFunctionGroups.flatMap((category) =>
  category.children.flatMap((subcategory) =>
    subcategory.children.map((item) => ({
      ...item,
      categoryCode: category.code,
      categoryName: category.name,
      subcategoryCode: subcategory.code,
      subcategoryName: subcategory.name,
    })),
  ),
);

export function filterJobFunctions(
  options: { categoryCode?: string; subcategoryCode?: string; search?: string } = {},
) {
  const query = options.search?.trim().toLocaleLowerCase() ?? '';
  const matching = functions.filter(
    (item) =>
      (!options.categoryCode || item.categoryCode === options.categoryCode) &&
      (!options.subcategoryCode || item.subcategoryCode === options.subcategoryCode) &&
      `${item.name} ${item.categoryName} ${item.subcategoryName}`.toLocaleLowerCase().includes(query),
  );
  // Some source jobs belong to several branches. Filter before deduplicating
  // so every category keeps its membership while selection uses one code.
  return [...new Map(matching.map((item) => [item.code, item])).values()];
}
