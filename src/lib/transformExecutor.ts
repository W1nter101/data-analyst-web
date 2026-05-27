import Database from 'better-sqlite3';

export interface TransformConfig {
  operation: 'add_column' | 'rename_column' | 'delete_column' | 'fill_empty';
  column_name: string;
  expression?: string;
  new_name?: string;
  data_type?: string;
  description?: string;
}

export interface TransformResult {
  success: boolean;
  message: string;
  affectedRows?: number;
}

export function executeTransform(
  dbPath: string,
  config: TransformConfig,
  schema: Array<{ column_name: string; type: string }>
): TransformResult {
  const db = new Database(dbPath);
  const table = `data`;
  const columnNames = schema.map(s => s.column_name);

  try {
    // Ensure original table exists for backup and restore capability
    const originalExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='data_original'`).get();
    if (!originalExists) {
      db.exec(`CREATE TABLE "data_original" AS SELECT * FROM "data"`);
    }

    switch (config.operation) {
      case 'add_column': {
        // Validate expression only uses existing columns (case-insensitive check)
        if (config.expression) {
          const exprUpper = config.expression.toUpperCase();
          const usedCols = columnNames.filter(c => 
            exprUpper.includes(c.toUpperCase())
          );
          if (usedCols.length === 0 && config.expression.match(/[a-zA-Z]/)) {
            return { success: false, message: `Không tìm thấy cột trong biểu thức: ${config.expression}` };
          }
        }
        
        const dtype = config.data_type ?? 'REAL';
        // Add new column via ALTER TABLE
        db.exec(`ALTER TABLE "${table}" ADD COLUMN "${config.column_name}" ${dtype}`);
        
        if (config.expression) {
          const result = db.prepare(
            `UPDATE "${table}" SET "${config.column_name}" = ${config.expression}`
          ).run();
          return { success: true, message: `Đã thêm cột "${config.column_name}"`, affectedRows: result.changes };
        }
        
        return { success: true, message: `Đã thêm cột "${config.column_name}"` };
      }

      case 'rename_column': {
        if (!config.new_name) return { success: false, message: 'Thiếu tên mới' };
        db.exec(`ALTER TABLE "${table}" RENAME COLUMN "${config.column_name}" TO "${config.new_name}"`);
        return { success: true, message: `Đã đổi tên cột "${config.column_name}" → "${config.new_name}"` };
      }

      case 'delete_column': {
        const remainingCols = columnNames.filter(c => c !== config.column_name);
        if (remainingCols.length === columnNames.length) {
          return { success: false, message: `Không tìm thấy cột "${config.column_name}"` };
        }
        const colList = remainingCols.map(c => `"${c}"`).join(', ');
        
        db.exec(`CREATE TABLE "${table}_backup" AS SELECT ${colList} FROM "${table}"`);
        db.exec(`DROP TABLE "${table}"`);
        db.exec(`ALTER TABLE "${table}_backup" RENAME TO "${table}"`);
        
        return { success: true, message: `Đã xóa cột "${config.column_name}"` };
      }

      case 'fill_empty': {
        let fillValue = config.expression ?? '0';
        
        // Premium Safety Guard: If it's a non-numeric string and not single-quoted, wrap it
        if (isNaN(Number(fillValue)) && !fillValue.startsWith("'") && !fillValue.endsWith("'")) {
          const isColumn = columnNames.some(c => c.toLowerCase() === fillValue.toLowerCase());
          if (!isColumn && /^[a-zA-Z\s\u00C0-\u1EF9]+$/.test(fillValue)) {
            fillValue = `'${fillValue.replace(/'/g, "''")}'`;
          }
        }

        const result = db.prepare(
          `UPDATE "${table}" SET "${config.column_name}" = ${fillValue} 
           WHERE "${config.column_name}" IS NULL OR "${config.column_name}" = ''`
        ).run();
        
        return { success: true, message: `Đã điền ${result.changes} ô trống trong cột "${config.column_name}"`, affectedRows: result.changes };
      }

      default:
        return { success: false, message: 'Thao tác không hợp lệ' };
    }
  } catch (err) {
    return { success: false, message: `Lỗi: ${(err as Error).message}` };
  } finally {
    db.close();
  }
}
