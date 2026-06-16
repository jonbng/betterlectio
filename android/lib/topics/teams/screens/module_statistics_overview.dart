import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:betterlectio/topics/state/loading.dart';
import 'package:betterlectio/topics/teams/bloc/module_statistics_bloc.dart';
import 'package:betterlectio/topics/teams/widgets/module_stat.dart';
import 'package:betterlectio/widgets/layout/appbar.dart';

class ModuleStatisticsOverview extends StatelessWidget {
  const ModuleStatisticsOverview({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const BlAppbar(title: "Modulregnskab"),
      body: BlocBuilder<ModuleStatisticsBloc, ModulStatsState>(
        builder: (context, state) {
          if (state.total == 0 || state.current != state.total) {
            return LoadingScreen(
              progress: state.total != 0 ? state.current / state.total : null,
            );
          }
          return ListView.builder(
            itemCount: state.entries.length,
            itemBuilder: (context, index) {
              return ModuleStat(
                statistics: state.entries[index].$2,
                team: state.entries[index].$1,
              );
            },
          );
        },
      ),
    );
  }
}
