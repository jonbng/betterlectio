import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:lectio_wrapper/lectio_wrapper.dart';
import 'package:lectio_wrapper/types/primitives/team.dart';

class ModuleStatisticsBloc extends Cubit<ModulStatsState> {
  final Student student;
  ModuleStatisticsBloc(this.student) : super(ModulStatsState.initial()) {
    _load();
  }

  Stream<(Team, ModuleStatistics)> streamTeams(List<Team> teams) async* {
    for (var team in teams) {
      var stat = await student.teams.get(team);
      if (stat != null) {
        yield (team, stat);
      }
      emit(state.copyWith(current: state.current + 1));
    }
  }

  void _load() {
    student.teams.list().then(
      (teams) {
        emit(state..total = teams.length);
        streamTeams(teams).listen((event) {
          emit(state..entries = [...state.entries, event]);
        });
      },
    );
  }
}

class ModulStatsState {
  List<(Team, ModuleStatistics)> entries;
  int total;
  int current;

  factory ModulStatsState.initial() {
    return ModulStatsState([], 0, 0);
  }

  ModulStatsState copyWith(
      {List<(Team, ModuleStatistics)>? entries, int? total, int? current}) {
    return ModulStatsState(
        entries ?? this.entries, total ?? this.total, current ?? this.current);
  }

  ModulStatsState(this.entries, this.total, this.current);
}
