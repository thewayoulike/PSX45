export const exportToExcel = async (data: any[], fileName: string) => {
  try {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
  } catch { alert('The export could not be prepared. Please try again when connected.'); }
};

export const exportToCSV = async (data: any[], fileName: string) => {
  try {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(data);
  const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
  
  // Create a blob and trigger download
  const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { alert('The export could not be prepared. Please try again when connected.'); }
};
