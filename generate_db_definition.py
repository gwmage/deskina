import re
import pandas as pd
import os

def parse_prisma_schema(schema_content):
    models = []
    current_model = None
    lines = schema_content.splitlines()

    for line in lines:
        line = line.strip()
        
        model_match = re.match(r'model\s+(\w+)\s+\{', line)
        if model_match:
            if current_model:
                models.append(current_model)
            current_model = {'name': model_match.group(1), 'columns': []}
            continue

        if current_model and line == '}':
            if current_model:
                models.append(current_model)
            current_model = None
            continue

        if current_model:
            if not line or line.startswith('//') or line.startswith('@@'):
                continue

            column_match = re.match(r'(\w+)\s+([\w\[\]?]+)(.*)', line)
            if column_match:
                name = column_match.group(1)
                col_type = column_match.group(2)
                attributes_str = column_match.group(3).strip()
                
                is_pk = '@id' in attributes_str
                is_unique = '@unique' in attributes_str
                is_optional = '?' in col_type
                
                default_match = re.search(r'@default\((.*?)\)', attributes_str)
                default_value = default_match.group(1) if default_match else ''
                
                comment_match = re.search(r'//\s*(.*)', attributes_str)
                comment = comment_match.group(1).strip() if comment_match else ''

                current_model['columns'].append({
                    'name': name,
                    'type': col_type.replace('?', ''),
                    'pk': 'Y' if is_pk else 'N',
                    'unique': 'Y' if is_unique else 'N',
                    'nullable': 'Y' if is_optional else 'N',
                    'default': default_value,
                    'comment': comment
                })
    return models

def create_excel_from_file(input_filename, output_filename="database_definition.xlsx"):
    try:
        with open(input_filename, 'r', encoding='utf-8') as f:
            schema_content = f.read()
    except FileNotFoundError:
        print(f"Error: Input file '{input_filename}' was not found in the current directory '{os.getcwd()}'.")
        return

    models_data = parse_prisma_schema(schema_content)
    
    if not models_data:
        print("Error: No models were found in the provided schema file.")
        return

    all_columns = []
    for model in models_data:
        for column in model['columns']:
            all_columns.append({
                'Table Name': model['name'],
                'Column Name': column['name'],
                'Data Type': column['type'],
                'PK': column['pk'],
                'Nullable': column['nullable'],
                'Unique': column['unique'],
                'Default': column['default'],
                'Comment': column['comment'],
            })
            
    df = pd.DataFrame(all_columns)
    df = df[['Table Name', 'Column Name', 'Data Type', 'PK', 'Nullable', 'Unique', 'Default', 'Comment']]
    
    try:
        df.to_excel(output_filename, index=False, sheet_name='Database Schema')
        print(f"Success: Excel file '{output_filename}' has been created in the directory '{os.getcwd()}'.")
    except Exception as e:
        print(f"Error: Failed to write Excel file. Please ensure 'pandas' and 'openpyxl' libraries are installed (`pip install pandas openpyxl`). Error: {e}")

if __name__ == "__main__":
    # The agent should first read the original schema and write it to a temporary file,
    # then pass that temporary file's name to this script.
    # For this simulation, we'll assume the agent creates 'schema_to_process.prisma'.
    create_excel_from_file("schema.prisma")