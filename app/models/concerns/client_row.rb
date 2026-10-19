# Maps between a client's row for a piece or container and table columns.
# Fields every row has get their own column; the rest go in extras, so a
# field only some objects have needs no migration. drag is never saved.
module ClientRow
  extend ActiveSupport::Concern

  UNSAVED = %w[drag].freeze

  class_methods do
    # columns: { "clientField" => :column }
    def client_columns(columns)
      const_set(:CLIENT_COLUMNS, columns.freeze)
    end

    def attributes_from_client(row)
      row = row.to_h.stringify_keys.except(*UNSAVED)
      columns = self::CLIENT_COLUMNS
      attributes = columns.to_h { |field, column| [ column, row[field] ] }
      attributes.merge(extras: row.except(*columns.keys))
    end
  end

  def to_client
    self.class::CLIENT_COLUMNS.to_h { |field, column| [ field, self[column] ] }.merge(extras, "drag" => nil)
  end
end
