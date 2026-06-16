import 'package:community_charts_flutter/community_charts_flutter.dart'
    as charts;
import 'package:flutter/material.dart';
import 'package:lectio_wrapper/types/absence/entry.dart';

class AbsenceChart extends StatelessWidget {
  const AbsenceChart({super.key, required this.entries});

  final List<AbsenceEntry> entries;

  charts.Color _transformColor(Color c) {
    return charts.Color(r: c.red, g: c.green, b: c.blue, a: c.alpha);
  }

  @override
  Widget build(BuildContext context) {
    var colorScheme = Theme.of(context).colorScheme;
    var secondaryColor = _transformColor(colorScheme.secondary);
    var textColor = _transformColor(colorScheme.onSurface);
    return charts.BarChart(
      [
        charts.Series<AbsenceEntry, String>(
            seriesColor: secondaryColor,
            id: 'Fravær',
            data: entries,
            domainFn: (i, _) {
              return i.team.displayName;
            },
            measureFn: (i, _) {
              return i.regular.currentModules.current;
            },
            insideLabelStyleAccessorFn: (entry, _) {
              return charts.TextStyleSpec(color: textColor);
            },
            outsideLabelStyleAccessorFn: (entry, _) {
              return charts.TextStyleSpec(color: textColor);
            }),
      ],
      behaviors: [
        charts.ChartTitle("Modulers fravær",
            behaviorPosition: charts.BehaviorPosition.bottom,
            titleStyleSpec: charts.TextStyleSpec(
              color: textColor,
              fontSize: 12,
            )),
      ],
      barGroupingType: charts.BarGroupingType.groupedStacked,
      vertical: false,
      primaryMeasureAxis: charts.NumericAxisSpec(
          renderSpec: charts.SmallTickRendererSpec(
              labelStyle: charts.TextStyleSpec(color: textColor))),
      domainAxis: charts.OrdinalAxisSpec(
          renderSpec: charts.SmallTickRendererSpec(
              labelOffsetFromAxisPx: 8,
              labelStyle: charts.TextStyleSpec(color: textColor))),
    );
  }
}
